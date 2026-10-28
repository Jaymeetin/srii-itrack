-- Preserve items and history; make draft composition reversible until first physical submission.
create or replace function public.i_track_edit_draft_transmittal(
 p_transmittal uuid,
 p_action text,
 p_document uuid default null,
 p_compliance uuid default null,
 p_item uuid default null
) returns jsonb
language plpgsql security definer set search_path='' as $fn$
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
   if not found or c.status<>'verified' then
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
end $fn$;
revoke all on function public.i_track_edit_draft_transmittal(uuid,text,uuid,uuid,uuid) from public,anon;
grant execute on function public.i_track_edit_draft_transmittal(uuid,text,uuid,uuid,uuid) to authenticated;