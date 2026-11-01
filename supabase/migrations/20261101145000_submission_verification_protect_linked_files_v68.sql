-- SRII i-TRACK v68: Preserve uploaded school submission references and
-- prevent older clients from reviewing a file without its linked compliance.
-- Original uploaded files, school assignments and timestamps are not edited.
CREATE OR REPLACE FUNCTION public.i_track_mark_compliance_submitted(p_assignment uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
 a public.announcement_assignments%rowtype;
 me public.profiles%rowtype;
 existing public.announcement_compliances%rowtype;
 ref text;
begin
 select * into me from public.profiles
  where id=auth.uid() and account_status='active';
 if not found or me.role='oic_psds' then
  raise exception 'Approved account required';
 end if;
 select * into a from public.announcement_assignments
  where id=p_assignment for update;
 if not found or a.obligation_status<>'required' then
  raise exception 'Assignment not found';
 end if;
 if not exists(select 1 from public.announcements
     where id=a.announcement_id and status='open') then
  raise exception 'Announcement closed';
 end if;
 if not (me.role in ('main_admin','backup_admin')
    or a.school_id=me.school_id
    or (me.role='school_user' and me.position_title~*
      '^(administrative|administration)[[:space:]]+officer[[:space:]]+(ii|2)$|^ao[[:space:]]*(ii|2)$'))
 then
  raise exception 'Not authorized for school';
 end if;
 select * into existing from public.announcement_compliances
  where assignment_id=p_assignment for update;
 if found and existing.status='verified' then
  raise exception 'Already verified';
 end if;
 if found and existing.current_submission_id is not null then
  raise exception 'This school already has an uploaded file linked to its submission. Do not use Mark as Submitted; await verification or upload a corrected version.';
 end if;
 if found and existing.status='pending_verification' then
  raise exception 'This school already has a submission awaiting verification.';
 end if;
 if found then
  update public.announcement_compliances
    set status='pending_verification',submitted_by=auth.uid(),
        submitted_at=now(),current_submission_id=null,
        return_reason=null,verified_by=null,verified_at=null,
        updated_at=now()
   where id=existing.id returning compliance_number into ref;
 else
  ref:='SRII-SUB-'||to_char(now() at time zone 'Asia/Manila','YYYY')
   ||'-'||lpad(nextval('public.i_track_compliance_seq')::text,6,'0');
  insert into public.announcement_compliances
   (assignment_id,school_id,compliance_number,submitted_by)
   values(p_assignment,a.school_id,ref,auth.uid());
 end if;
 return ref;
end
$function$;

CREATE OR REPLACE FUNCTION public.i_track_verify_submission(p_submission_id uuid,p_approved boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare next_status text;
begin
 if not (select private.i_track_is_admin()) then
  raise exception 'District administrator access required';
 end if;
 -- This legacy file-only RPC must never silently leave a newer linked
 -- compliance record pending. Call i_track_verify_compliance for linked files.
 if exists(select 1 from public.announcement_compliances c
  where c.current_submission_id=p_submission_id and c.status='pending_verification') then
  raise exception 'This file belongs to a pending school compliance. Refresh Submission Verification and approve/return the compliance so both statuses change together.';
 end if;
 next_status:=case when p_approved then 'verified' else 'rejected' end;
 update public.submissions
  set verification_status=next_status,verified_by=auth.uid(),verified_at=now()
  where id=p_submission_id and storage_status in ('uploaded','archived')
   and verification_status='pending';
 if not found then
  raise exception 'Submission is unavailable or has already been reviewed';
 end if;
 insert into public.audit_log(actor_user_id,action,entity_type,entity_id)
 values(auth.uid(),
  case when p_approved then 'submission_verified' else 'submission_rejected' end,
  'submission',p_submission_id::text);
end;
$function$;

REVOKE ALL ON FUNCTION public.i_track_mark_compliance_submitted(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.i_track_mark_compliance_submitted(uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.i_track_verify_submission(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.i_track_verify_submission(uuid,boolean) TO authenticated,service_role;
