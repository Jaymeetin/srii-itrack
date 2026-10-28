CREATE OR REPLACE FUNCTION private.i_track_sync_compliance_upload()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare school uuid;
begin
 if tg_op='INSERT' then
  select school_id into school from public.announcement_assignments where id=new.assignment_id;
  insert into public.announcement_compliances(assignment_id,school_id,compliance_number,submitted_by,submitted_at,status,current_submission_id,verified_by,verified_at)
  values(new.assignment_id,coalesce(school,new.representing_school_id),
   'SRII-SUB-'||to_char(new.first_received_at at time zone 'Asia/Manila','YYYY')||'-'||lpad(nextval('public.i_track_compliance_seq')::text,6,'0'),
   new.submitted_by,new.first_received_at,'pending_verification',new.id,new.verified_by,new.verified_at)
  on conflict(assignment_id) do update set submitted_by=new.submitted_by,submitted_at=new.first_received_at,
  current_submission_id=new.id,status='pending_verification',verified_by=null,verified_at=null,return_reason=null,updated_at=now();
 elsif tg_op='UPDATE' and new.verification_status is distinct from old.verification_status then
  update public.announcement_compliances set status=case new.verification_status when 'verified' then 'verified' when 'rejected' then 'returned' else 'pending_verification' end,
  verified_by=new.verified_by,verified_at=new.verified_at,updated_at=now()
  where assignment_id=new.assignment_id and current_submission_id=new.id;
 end if;
 return new;
end $function$
;
create trigger compliance_upload_sync after insert or update of verification_status on public.submissions for each row execute function private.i_track_sync_compliance_upload();