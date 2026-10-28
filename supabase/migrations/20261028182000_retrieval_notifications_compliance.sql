CREATE OR REPLACE FUNCTION public.i_track_division_notice_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare sender uuid; number text;
begin
 if tg_table_name='division_transmittals' then
  if tg_op='INSERT' or old.assigned_submitter is distinct from new.assigned_submitter then
   insert into public.division_notifications(recipient_id,transmittal_id,message) values(new.assigned_submitter,new.id,'Division transmittal assignment: '||new.transmittal_number);
  end if;
  return new;
 end if;
 if tg_op='UPDATE' and old.division_status is distinct from new.division_status then
  select coalesce(doc.created_by,comp.submitted_by) into sender from public.division_transmittal_items di left join public.documents doc on doc.id=di.document_id left join public.announcement_compliances comp on comp.id=di.compliance_id where di.id=new.id;
  select t.transmittal_number into number from public.division_transmittals t where t.id=new.transmittal_id;
  if sender is not null and new.division_status in ('retrieved_from_division','forwarded_to_district','received_at_district','received_by_sender','lost','not_for_return','submitted_to_division') then
   insert into public.division_notifications(recipient_id,transmittal_id,item_id,message)
   values(sender,new.transmittal_id,new.id,case when new.division_status='received_at_district' then 'Ready for collection at district: ' when new.division_status='lost' then 'Reported lost: ' when new.division_status='not_for_return' then 'Not for return: ' when new.division_status='received_by_sender' then 'Final receipt confirmed: ' when new.division_status='retrieved_from_division' then 'Retrieved from Division: ' when new.division_status='forwarded_to_district' then 'Sent for District turnover: ' else 'Submitted to Division: ' end||new.tracking_number);
  end if;
 end if;
 return new;
end $function$
;