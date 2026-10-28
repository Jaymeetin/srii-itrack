CREATE OR REPLACE FUNCTION public.i_track_division_list()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object(
 'transmittals',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.division_transmittals t where exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status='active' and p.role<>'oic_psds') and
 (t.prepared_by=auth.uid() or t.assigned_submitter=auth.uid() or private.i_track_is_admin() or exists(select 1 from public.division_transmittal_items i where i.transmittal_id=t.id and (private.i_track_can_view_document(i.document_id) or exists(select 1 from public.announcement_compliances c join public.profiles p on p.id=auth.uid() where c.id=i.compliance_id and (c.submitted_by=p.id or c.school_id=p.school_id)))))),'[]'::jsonb),
 'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.tracking_number) from public.division_transmittal_items i join public.division_transmittals t on t.id=i.transmittal_id where exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status='active' and p.role<>'oic_psds') and
 (private.i_track_is_admin() or t.prepared_by=auth.uid() or t.assigned_submitter=auth.uid() or private.i_track_can_view_document(i.document_id) or exists(select 1 from public.announcement_compliances c join public.profiles p on p.id=auth.uid() where c.id=i.compliance_id and (c.submitted_by=p.id or c.school_id=p.school_id)))),'[]'::jsonb),
 'eligible',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'subject',d.subject,'tracking_number',d.tracking_number,'document_type',d.document_type,'school_id',d.origin_school_id)) from public.documents d where d.destination='division' and d.status<>'completed' and not exists(select 1 from public.division_transmittal_items i where i.document_id=d.id and i.division_status not in ('received_by_sender','not_for_return','cancelled','lost')) limit 200),'[]'::jsonb),
 'eligible_compliances',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'tracking_number',c.compliance_number,'subject',a.title,'school_id',c.school_id,'school_name',s.name,'document_type','Announcement Submission')) from public.announcement_compliances c join public.announcement_assignments aa on aa.id=c.assignment_id join public.announcements a on a.id=aa.announcement_id left join public.schools s on s.id=c.school_id where c.status='verified' and a.status<>'cancelled' and not exists(select 1 from public.division_transmittal_items i where i.compliance_id=c.id and i.division_status not in ('received_by_sender','not_for_return','cancelled','lost')) limit 200),'[]'::jsonb),
 'people',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'position',p.position_title,'school_name',coalesce(s.name,'District Office'))) from public.profiles p join auth.users au on au.id=p.id left join public.schools s on s.id=p.school_id where p.account_status='active' and p.role<>'oic_psds' and au.email_confirmed_at is not null),'[]'::jsonb)
 ) from public.profiles viewer where viewer.id=auth.uid() and viewer.account_status='active' and viewer.role<>'oic_psds'
$function$
;

CREATE OR REPLACE FUNCTION public.i_track_create_mixed_transmittal(p_documents uuid[] DEFAULT '{}'::uuid[], p_compliances uuid[] DEFAULT '{}'::uuid[], p_submitter uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid(); tid uuid; no text; n int;
begin
 if not exists(select 1 from public.profiles where id=u and account_status='active' and role<>'oic_psds') then raise exception 'Not authorized';end if;
 if not exists(select 1 from public.profiles p join auth.users au on au.id=p.id where p.id=p_submitter and p.account_status='active' and p.role<>'oic_psds' and au.email_confirmed_at is not null) then raise exception 'Invalid submitter';end if;
 n:=coalesce(cardinality(p_documents),0)+coalesce(cardinality(p_compliances),0);
 if n<1 or n>100 then raise exception 'Choose 1-100 items';end if;
 if (select count(distinct x) from unnest(p_documents) x)<>cardinality(p_documents) or (select count(distinct x) from unnest(p_compliances) x)<>cardinality(p_compliances) then raise exception 'Duplicate item';end if;
 if (select count(*) from public.documents d where d.id=any(p_documents) and d.destination='division' and d.status<>'completed' and not exists(select 1 from public.division_transmittal_items i where i.document_id=d.id and i.division_status not in ('received_by_sender','not_for_return','cancelled','lost')))<>cardinality(p_documents) then raise exception 'Ineligible document';end if;
 if (select count(*) from public.announcement_compliances c where c.id=any(p_compliances) and c.status='verified' and exists(select 1 from public.announcement_assignments aa join public.announcements a on a.id=aa.announcement_id where aa.id=c.assignment_id and a.status<>'cancelled') and not exists(select 1 from public.division_transmittal_items i where i.compliance_id=c.id and i.division_status not in ('received_by_sender','not_for_return','cancelled','lost')))<>cardinality(p_compliances) then raise exception 'Ineligible compliance';end if;
 no:='SRII-TR-'||to_char(now() at time zone 'Asia/Manila','YYYY')||'-'||lpad(nextval('public.division_transmittal_sequence')::text,6,'0');
 insert into public.division_transmittals(transmittal_number,prepared_by,assigned_submitter,status) values(no,u,p_submitter,'draft') returning id into tid;
 insert into public.division_transmittal_items(transmittal_id,document_id,school_id,document_label,tracking_number,cycle_number,document_type)
 select tid,d.id,d.origin_school_id,d.subject,d.tracking_number,coalesce((select max(cycle_number)+1 from public.division_transmittal_items where document_id=d.id),1),d.document_type from public.documents d where d.id=any(p_documents);
 insert into public.division_transmittal_items(transmittal_id,compliance_id,school_id,document_label,tracking_number,cycle_number,document_type)
 select tid,c.id,c.school_id,a.title,c.compliance_number,coalesce((select max(cycle_number)+1 from public.division_transmittal_items where compliance_id=c.id),1),'Announcement Submission' from public.announcement_compliances c join public.announcement_assignments aa on aa.id=c.assignment_id join public.announcements a on a.id=aa.announcement_id where c.id=any(p_compliances);
 insert into public.division_transmittal_events(transmittal_id,actor_id,event_type) values(tid,u,'created');
 return jsonb_build_object('id',tid,'number',no);
end $function$
;

CREATE OR REPLACE FUNCTION public.i_track_edit_draft_transmittal(p_transmittal uuid, p_action text, p_document uuid DEFAULT NULL::uuid, p_compliance uuid DEFAULT NULL::uuid, p_item uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 u uuid:=auth.uid();
 t public.division_transmittals%rowtype;
 i public.division_transmittal_items%rowtype;
 d public.documents%rowtype;
 c public.announcement_compliances%rowtype;
 prev uuid;
 label_text text;
 event_type text;
begin
 if u is null or not exists (select 1 from public.profiles where id=u and account_status='active' and role<>'oic_psds')
 then raise exception 'Active approved account required'; end if;
 select * into t from public.division_transmittals where id=p_transmittal for update;
 if not found then raise exception 'Transmittal not found'; end if;
 if t.prepared_by<>u and not (select private.i_track_is_admin()) then
  raise exception 'Only the preparer or district administrator may edit a transmittal'; end if;
 if t.dispatched_at is not null or t.status<>'draft'
   or exists (select 1 from public.division_transmittal_items x
     where x.transmittal_id=t.id and (x.submitted_at is not null or x.division_status not in ('in_transmittal','cancelled')))
 then raise exception 'Transmittal is locked after its first physical submission'; end if;
 if p_action='remove' then
  select * into i from public.division_transmittal_items
    where id=p_item and transmittal_id=t.id for update;
  if not found or i.division_status<>'in_transmittal' then
   raise exception 'Choose an unsubmitted item to remove'; end if;
  update public.division_transmittal_items set division_status='cancelled',
   resolution_reason='Removed from draft before physical submission',
   resolved_by=u,resolved_at=now() where id=i.id;
  prev:=i.id; event_type:='draft_item_removed';
 elsif p_action in ('add_document','add_compliance') then
  if (select count(*) from public.division_transmittal_items
    where transmittal_id=t.id and division_status='in_transmittal')>=100
  then raise exception 'Maximum 100 items in a transmittal'; end if;
  if p_action='add_document' then
   if p_document is null or p_compliance is not null then raise exception 'Choose one document'; end if;
   select * into d from public.documents where id=p_document for update;
   if not found or d.destination<>'division' or d.status='completed' then
    raise exception 'Document is not eligible for Division'; end if;
   if exists (select 1 from public.division_transmittal_items x
    where x.document_id=d.id and x.division_status not in ('received_by_sender','not_for_return','cancelled','lost'))
   then raise exception 'Document is already included in an active transmittal'; end if;
   select * into i from public.division_transmittal_items
     where transmittal_id=t.id and document_id=d.id for update;
   if found and i.division_status='cancelled' then
    update public.division_transmittal_items set division_status='in_transmittal',
     resolved_by=null,resolved_at=null,resolution_reason=null where id=i.id;
    prev:=i.id;
   else
    insert into public.division_transmittal_items
      (transmittal_id,document_id,school_id,document_label,tracking_number,cycle_number,document_type)
    values(t.id,d.id,d.origin_school_id,d.subject,d.tracking_number,
      (select coalesce(max(cycle_number),0)+1 from public.division_transmittal_items where document_id=d.id),d.document_type)
    returning id into prev;
   end if;
  else
   if p_compliance is null or p_document is not null then raise exception 'Choose one submission'; end if;
   select * into c from public.announcement_compliances where id=p_compliance for update;
   if not found or c.status<>'verified' or exists(select 1 from public.announcement_assignments aa join public.announcements a on a.id=aa.announcement_id where aa.id=c.assignment_id and a.status='cancelled') then
    raise exception 'Only verified school submissions may be added'; end if;
   if exists (select 1 from public.division_transmittal_items x
    where x.compliance_id=c.id and x.division_status not in ('received_by_sender','not_for_return','cancelled','lost'))
   then raise exception 'School submission is already included in an active transmittal'; end if;
   select * into i from public.division_transmittal_items
      where transmittal_id=t.id and compliance_id=c.id for update;
   if found and i.division_status='cancelled' then
    update public.division_transmittal_items set division_status='in_transmittal',
      resolved_by=null,resolved_at=null,resolution_reason=null where id=i.id;
    prev:=i.id;
   else
    select a.title into label_text from public.announcement_assignments aa
      join public.announcements a on a.id=aa.announcement_id where aa.id=c.assignment_id;
    insert into public.division_transmittal_items
     (transmittal_id,compliance_id,school_id,document_label,tracking_number,cycle_number,document_type)
    values(t.id,c.id,c.school_id,coalesce(label_text,'Announcement Submission'),c.compliance_number,
      (select coalesce(max(cycle_number),0)+1 from public.division_transmittal_items where compliance_id=c.id),'Announcement Submission')
    returning id into prev;
   end if;
  end if;
  event_type:='draft_item_added';
 else raise exception 'Unsupported draft editing action'; end if;
 insert into public.division_transmittal_events(transmittal_id,item_id,actor_id,event_type,details)
 values(t.id,prev,u,event_type,jsonb_build_object('document_id',p_document,'compliance_id',p_compliance));
 update public.division_transmittals set updated_at=now() where id=t.id;
 return jsonb_build_object('ok',true,'item_id',prev,'action',event_type);
end $function$
;