-- SRII i-TRACK Division forms: preserve existing RLS-aware output and add submitting AO provenance.
-- These RPCs are kept complete for reproducible deployment. Do not expose unrelated documents.
CREATE OR REPLACE FUNCTION public.i_track_division_list()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object(
 'transmittals',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.division_transmittals t where exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status='active' and p.role<>'oic_psds') and
 (t.prepared_by=auth.uid() or t.assigned_submitter=auth.uid() or private.i_track_is_admin() or exists(select 1 from public.division_transmittal_items i where i.transmittal_id=t.id and (private.i_track_can_view_document(i.document_id) or exists(select 1 from public.announcement_compliances c join public.profiles p on p.id=auth.uid() where c.id=i.compliance_id and (c.submitted_by=p.id or c.school_id=p.school_id)))))),'[]'::jsonb),
 'items',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('effective_return_required',coalesce(i.return_required_override,(select dd.return_required from public.documents dd where dd.id=i.document_id),true),
'ao_sender_name',coalesce(actual_ao.display_name,origin_ao.display_name,assigned_ao.display_name,'Not recorded'),
'ao_sender_position',coalesce(actual_ao.position_title,origin_ao.position_title,assigned_ao.position_title,''),
'ao_sender_is_submitted',i.submitted_by IS NOT NULL) order by i.tracking_number) from public.division_transmittal_items i join public.division_transmittals t on t.id=i.transmittal_id
 left join public.documents source_doc on source_doc.id=i.document_id
 left join public.announcement_compliances source_compliance on source_compliance.id=i.compliance_id
 left join public.profiles actual_ao on actual_ao.id=i.submitted_by
 left join public.profiles origin_ao on origin_ao.id=coalesce(source_doc.created_by,source_compliance.submitted_by)
 left join public.profiles assigned_ao on assigned_ao.id=t.assigned_submitter
 where exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status='active' and p.role<>'oic_psds') and
 (private.i_track_is_admin() or t.prepared_by=auth.uid() or t.assigned_submitter=auth.uid() or private.i_track_can_view_document(i.document_id) or exists(select 1 from public.announcement_compliances c join public.profiles p on p.id=auth.uid() where c.id=i.compliance_id and (c.submitted_by=p.id or c.school_id=p.school_id)))),'[]'::jsonb),
 'eligible',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'subject',d.subject,'tracking_number',d.tracking_number,'document_type',d.document_type,'school_id',d.origin_school_id)) from public.documents d where d.destination='division' and d.status<>'completed' and not exists(select 1 from public.division_transmittal_items i where i.document_id=d.id and i.division_status not in ('received_by_sender','not_for_return','cancelled','lost')) limit 200),'[]'::jsonb),
 'eligible_compliances',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'tracking_number',c.compliance_number,'subject',a.title,'school_id',c.school_id,'school_name',s.name,'document_type','Announcement Submission')) from public.announcement_compliances c join public.announcement_assignments aa on aa.id=c.assignment_id join public.announcements a on a.id=aa.announcement_id left join public.schools s on s.id=c.school_id where c.status='verified' and a.status<>'cancelled' and not exists(select 1 from public.division_transmittal_items i where i.compliance_id=c.id and i.division_status not in ('received_by_sender','not_for_return','cancelled','lost')) limit 200),'[]'::jsonb),
 'people',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'position',p.position_title,'school_name',coalesce(s.name,'District Office'))) from public.profiles p join auth.users au on au.id=p.id left join public.schools s on s.id=p.school_id where p.account_status='active' and p.role<>'oic_psds' and au.email_confirmed_at is not null),'[]'::jsonb)
 ) from public.profiles viewer where viewer.id=auth.uid() and viewer.account_status='active' and viewer.role<>'oic_psds'
$function$
;

CREATE OR REPLACE FUNCTION public.i_track_retrieval_board()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid(); result jsonb;
begin
 if u is null or not (select private.i_track_is_operator()) then
   raise exception 'Approved routing account required';
 end if;
 select jsonb_build_object(
 'available',coalesce((
   select jsonb_agg(jsonb_build_object(
    'item_id',i.id,'tracking_number',i.tracking_number,'document_label',i.document_label,
    'document_type',i.document_type,'school_name',coalesce(s.name,'District Office'),
    'transmittal_number',t.transmittal_number,'transmittal_id',t.id,
    'owner_id',coalesce(i.rightful_owner_id,d.created_by,c.submitted_by))
    order by i.tracking_number)
   from public.division_transmittal_items i
   join public.division_transmittals t on t.id=i.transmittal_id
   left join public.schools s on s.id=i.school_id
   left join public.documents d on d.id=i.document_id
   left join public.announcement_compliances c on c.id=i.compliance_id
   where i.division_status='submitted_to_division'
 ),'[]'::jsonb),
 'my_batches',coalesce((
   select jsonb_agg(jsonb_build_object(
     'id',b.id,'number',b.batch_number,'created_at',b.created_at,
     'retriever_id',b.retriever_id) order by b.created_at desc)
   from public.division_retrieval_batches b where b.retriever_id=u
 ),'[]'::jsonb),
 'my_batch_items',coalesce((
   select jsonb_agg(jsonb_build_object(
     'batch_id',bi.batch_id,'item_id',i.id,'tracking_number',i.tracking_number,
     'document_label',i.document_label,'school_name',coalesce(s.name,'District Office'),
     'division_status',i.division_status,'transmittal_number',t.transmittal_number,
     'owner_id',coalesce(i.rightful_owner_id,d.created_by,c.submitted_by),
     'owner_name',coalesce(owner.display_name,'Original sender'),
     'retrieved_at',i.retrieved_from_division_at)
     order by i.tracking_number)
   from public.division_retrieval_batch_items bi
   join public.division_retrieval_batches b on b.id=bi.batch_id
   join public.division_transmittal_items i on i.id=bi.item_id
   join public.division_transmittals t on t.id=i.transmittal_id
   left join public.schools s on s.id=i.school_id
   left join public.documents d on d.id=i.document_id
   left join public.announcement_compliances c on c.id=i.compliance_id
   left join public.profiles owner on owner.id=coalesce(i.rightful_owner_id,d.created_by,c.submitted_by)
   where b.retriever_id=u
 ),'[]'::jsonb),
 'turnovers',coalesce((
   select jsonb_agg(jsonb_build_object(
     'id',v.id,'number',v.turnover_number,'status',v.status,
     'retriever_id',v.retriever_id,'retriever_name',coalesce(r.display_name,'Retriever'),
     'retriever_position',coalesce(r.position_title,''),
     'recipient_id',v.recipient_id,'recipient_name',coalesce(p.display_name,'District recipient'),
     'created_at',v.created_at,'handed_over_at',v.handed_over_at)
     order by v.created_at desc)
   from public.division_retrieval_turnovers v
   left join public.profiles r on r.id=v.retriever_id
   left join public.profiles p on p.id=v.recipient_id
   where (v.retriever_id=u or v.recipient_id=u or (select private.i_track_is_admin()))
   and v.status<>'cancelled'
 ),'[]'::jsonb),
 'turnover_items',coalesce((
   select jsonb_agg(jsonb_build_object(
     'turnover_id',vi.turnover_id,'item_id',i.id,'tracking_number',i.tracking_number,
     'document_label',i.document_label,'document_type',i.document_type,
     'school_name',coalesce(s.name,'District Office'),'division_status',i.division_status,
     'ao_sender_name',coalesce(actual_ao.display_name,origin_ao.display_name,assigned_ao.display_name,'Not recorded'),
     'ao_sender_position',coalesce(actual_ao.position_title,origin_ao.position_title,assigned_ao.position_title,''),
     'ao_sender_is_submitted',i.submitted_by IS NOT NULL)
     order by i.tracking_number)
   from public.division_retrieval_turnover_items vi
   join public.division_retrieval_turnovers v on v.id=vi.turnover_id
   join public.division_transmittal_items i on i.id=vi.item_id
   left join public.schools s on s.id=i.school_id
   join public.division_transmittals t on t.id=i.transmittal_id
   left join public.documents source_doc on source_doc.id=i.document_id
   left join public.announcement_compliances source_compliance on source_compliance.id=i.compliance_id
   left join public.profiles actual_ao on actual_ao.id=i.submitted_by
   left join public.profiles origin_ao on origin_ao.id=coalesce(source_doc.created_by,source_compliance.submitted_by)
   left join public.profiles assigned_ao on assigned_ao.id=t.assigned_submitter
   where vi.active and v.status<>'cancelled'
   and (v.retriever_id=u or v.recipient_id=u or (select private.i_track_is_admin()))
 ),'[]'::jsonb),
 'district_queue',coalesce((
   select jsonb_agg(jsonb_build_object(
     'item_id',i.id,'tracking_number',i.tracking_number,
     'document_label',i.document_label,'school_name',coalesce(s.name,'District Office'),
     'division_status',i.division_status,'transmittal_number',t.transmittal_number)
     order by i.tracking_number)
   from public.division_transmittal_items i
   join public.division_transmittals t on t.id=i.transmittal_id
   left join public.schools s on s.id=i.school_id
   where i.division_status='forwarded_to_district' and i.district_recipient_id=u
 ),'[]'::jsonb),
 'claimable',coalesce((
   select jsonb_agg(jsonb_build_object(
     'item_id',i.id,'tracking_number',i.tracking_number,
     'document_label',i.document_label,'school_name',coalesce(s.name,'District Office'),
     'division_status',i.division_status,
     'retriever_id',i.retrieved_from_division_by,'transmittal_number',t.transmittal_number)
     order by i.tracking_number)
   from public.division_transmittal_items i
   join public.division_transmittals t on t.id=i.transmittal_id
   left join public.schools s on s.id=i.school_id
   left join public.documents d on d.id=i.document_id
   left join public.announcement_compliances c on c.id=i.compliance_id
   where coalesce(i.rightful_owner_id,d.created_by,c.submitted_by)=u
   and (i.division_status='received_at_district'
     or (i.division_status='retrieved_from_division' and i.retrieved_from_division_by=u))
 ),'[]'::jsonb),
 'manageable_owners',coalesce((
   select jsonb_agg(jsonb_build_object(
     'item_id',i.id,'tracking_number',i.tracking_number,
     'document_label',i.document_label,'owner_id',coalesce(i.rightful_owner_id,d.created_by,c.submitted_by),
     'owner_name',coalesce(owner.display_name,'Unassigned'),
     'division_status',i.division_status) order by i.tracking_number)
   from public.division_transmittal_items i
   left join public.documents d on d.id=i.document_id
   left join public.announcement_compliances c on c.id=i.compliance_id
   left join public.profiles owner on owner.id=coalesce(i.rightful_owner_id,d.created_by,c.submitted_by)
   where i.division_status in ('in_transmittal','submitted_to_division','retrieved_from_division','forwarded_to_district','received_at_district')
   and ((select private.i_track_is_admin()) or d.created_by=u or c.submitted_by=u)
 ),'[]'::jsonb),
 'district_recipients',coalesce((
   select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'position',p.position_title)
     order by p.display_name)
   from public.profiles p join auth.users au on au.id=p.id
   where p.account_status='active' and p.role in ('main_admin','backup_admin','school_user')
     and (p.school_id is null or p.role in ('main_admin','backup_admin'))
     and au.email_confirmed_at is not null
 ),'[]'::jsonb),
 'claimant_accounts',coalesce((
   select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'position',p.position_title)
    order by p.display_name)
   from public.profiles p join auth.users au on au.id=p.id
   where p.account_status='active' and p.role in ('school_user','main_admin','backup_admin')
     and au.email_confirmed_at is not null
 ),'[]'::jsonb)
 ) into result;
 return result;
end $function$
;
