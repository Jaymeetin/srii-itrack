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
 if (select count(*) from public.announcement_compliances c where c.id=any(p_compliances) and c.status='verified' and not exists(select 1 from public.division_transmittal_items i where i.compliance_id=c.id and i.division_status not in ('received_by_sender','not_for_return','cancelled','lost')))<>cardinality(p_compliances) then raise exception 'Ineligible compliance';end if;
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