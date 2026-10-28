CREATE OR REPLACE FUNCTION public.i_track_monitor(p_announcement_id uuid)
 RETURNS TABLE(school_name text, submission_status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH viewer AS (
    SELECT p.role,p.school_id
    FROM public.profiles p
    WHERE p.id=auth.uid() AND p.account_status='active'
  )
  SELECT s.name,
    CASE WHEN a.status='cancelled' THEN 'Cancelled'
         WHEN c.id IS NULL THEN 'Pending'
         WHEN c.status='returned' THEN 'Returned for Correction'
         WHEN c.status='pending_verification' THEN 'Pending Verification'
         WHEN c.submitted_at > a.deadline_at THEN 'Late'
         ELSE 'Submitted' END::text
  FROM public.announcements a
  JOIN public.announcement_assignments aa
    ON aa.announcement_id=a.id AND aa.obligation_status='required'
   AND aa.school_id IS NOT NULL
  JOIN public.schools s ON s.id=aa.school_id
  LEFT JOIN public.announcement_compliances c ON c.assignment_id=aa.id
  WHERE a.id=p_announcement_id
    AND a.status IN ('open','closed','cancelled')
    AND EXISTS (
      SELECT 1 FROM viewer v
      WHERE v.role IN ('main_admin','backup_admin','oic_psds')
         OR EXISTS (
          SELECT 1 FROM public.announcement_assignments mine
          WHERE mine.announcement_id=a.id
           AND mine.obligation_status='required'
           AND (mine.school_id=v.school_id OR mine.assigned_user_id=auth.uid())
        )
    )
  ORDER BY s.name;
 $function$
;

CREATE OR REPLACE FUNCTION public.i_track_verify_compliance(p_compliance uuid, p_approve boolean, p_reason text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.announcement_compliances%rowtype;
begin
 select * into c from public.announcement_compliances where id=p_compliance for update;
 if not found or c.status<>'pending_verification' then raise exception 'Submission not pending verification';end if;
 if exists(select 1 from public.announcement_assignments aa join public.announcements a on a.id=aa.announcement_id where aa.id=c.assignment_id and a.status='cancelled') then raise exception 'This announcement was cancelled; verification is closed';end if;
 if not (select private.i_track_is_admin()) and not exists (
  select 1 from public.announcement_assignments aa
  join public.announcement_approvers ap on ap.announcement_id=aa.announcement_id
  join public.profiles actor on actor.id=ap.user_id
  join auth.users auth_user on auth_user.id=actor.id
  where aa.id=c.assignment_id and ap.user_id=auth.uid()
   and actor.account_status='active' and auth_user.email_confirmed_at is not null
 ) then raise exception 'Not an assigned approver for this announcement';end if;
 if not p_approve and length(btrim(coalesce(p_reason,'')))=0 then raise exception 'Return reason required';end if;
 if c.current_submission_id is not null then
  update public.submissions set verification_status=case when p_approve then 'verified' else 'rejected' end,verified_by=auth.uid(),verified_at=now()
  where id=c.current_submission_id and verification_status='pending';
 end if;
 update public.announcement_compliances set status=case when p_approve then 'verified' else 'returned' end,
 verified_by=auth.uid(),verified_at=now(),return_reason=case when p_approve then null else btrim(p_reason) end,updated_at=now()
 where id=c.id;
 insert into public.audit_log(actor_user_id,action,entity_type,entity_id)
 values(auth.uid(),case when p_approve then 'compliance_verified' else 'compliance_returned' end,'announcement_compliance',c.id::text);
 return true;
end $function$
;

CREATE OR REPLACE FUNCTION public.i_track_set_announcement_approvers(p_announcement uuid, p_user_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n integer; expected integer;
begin
 if not (select private.i_track_is_admin()) then raise exception 'District administrator required'; end if;
 if not exists(select 1 from public.announcements where id=p_announcement and status<>'cancelled') then raise exception 'Announcement missing or cancelled'; end if;
 if p_user_ids is null then p_user_ids:='{}'::uuid[];end if;
 if cardinality(p_user_ids)>50 then raise exception 'Too many approvers';end if;
 select count(distinct v) into expected from unnest(p_user_ids) as v;
 if expected<>cardinality(p_user_ids) then raise exception 'Remove duplicate assigned approvers';end if;
 select count(*) into n from public.profiles p join auth.users au on au.id=p.id
 where p.id=any(p_user_ids) and p.account_status='active'
  and p.role in ('school_user','main_admin','backup_admin')
  and au.email_confirmed_at is not null;
 if n<>expected then raise exception 'Approvers must have verified, approved, active accounts';end if;
 delete from public.announcement_approvers where announcement_id=p_announcement;
 insert into public.announcement_approvers(announcement_id,user_id,assigned_by)
 select p_announcement,v,auth.uid() from unnest(p_user_ids) as v;
 insert into public.audit_log(actor_user_id,action,entity_type,entity_id,details)
 values(auth.uid(),'announcement_approvers_updated','announcement',p_announcement::text,jsonb_build_object('approver_count',n));
 return n;
end $function$
;