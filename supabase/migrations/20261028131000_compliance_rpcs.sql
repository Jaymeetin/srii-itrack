-- Current deployed compliance RPCs
CREATE OR REPLACE FUNCTION public.i_track_compliance_list(p_announcement uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(jsonb_build_object(
 'id',c.id,'assignment_id',c.assignment_id,'announcement_id',aa.announcement_id,
 'number',c.compliance_number,'school_id',c.school_id,'school_name',coalesce(s.name,'School'),
 'announcement_title',a.title,'status',c.status,'submitted_at',c.submitted_at,
 'submitted_by_name',coalesce(p.display_name,'Authorized user'),'verified_at',c.verified_at,
 'return_reason',c.return_reason,'has_attachment',c.current_submission_id is not null,
 'current_submission_id',c.current_submission_id) order by c.submitted_at desc),'[]'::jsonb)
 from public.announcement_compliances c
 join public.announcement_assignments aa on aa.id=c.assignment_id
 join public.announcements a on a.id=aa.announcement_id
 left join public.schools s on s.id=c.school_id
 left join public.profiles p on p.id=c.submitted_by
 where (p_announcement is null or aa.announcement_id=p_announcement)
 and exists(select 1 from public.profiles viewer where viewer.id=auth.uid() and viewer.account_status='active' and
 (viewer.role in ('main_admin','backup_admin') or (viewer.school_id is not null and viewer.school_id=c.school_id) or viewer.id=c.submitted_by))
 $function$
;

CREATE OR REPLACE FUNCTION public.i_track_mark_compliance_submitted(p_assignment uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.announcement_assignments%rowtype; me public.profiles%rowtype; existing public.announcement_compliances%rowtype; ref text;
begin
 select * into me from public.profiles where id=auth.uid() and account_status='active';
 if not found or me.role='oic_psds' then raise exception 'Approved account required'; end if;
 select * into a from public.announcement_assignments where id=p_assignment for update;
 if not found or a.obligation_status<>'required' then raise exception 'Assignment not found'; end if;
 if not exists(select 1 from public.announcements where id=a.announcement_id and status='open') then raise exception 'Announcement closed'; end if;
 if not (me.role in ('main_admin','backup_admin') or a.school_id=me.school_id or
  (me.role='school_user' and me.position_title~* '^(administrative|administration)[[:space:]]+officer[[:space:]]+(ii|2)$|^ao[[:space:]]*(ii|2)$')) then raise exception 'Not authorized for school';end if;
 select * into existing from public.announcement_compliances where assignment_id=p_assignment for update;
 if found and existing.status='verified' then raise exception 'Already verified';end if;
 if found then
  update public.announcement_compliances set status='pending_verification',submitted_by=auth.uid(),submitted_at=now(),current_submission_id=null,return_reason=null,verified_by=null,verified_at=null,updated_at=now() where id=existing.id returning compliance_number into ref;
 else
  ref:='SRII-SUB-'||to_char(now() at time zone 'Asia/Manila','YYYY')||'-'||lpad(nextval('public.i_track_compliance_seq')::text,6,'0');
  insert into public.announcement_compliances(assignment_id,school_id,compliance_number,submitted_by) values(p_assignment,a.school_id,ref,auth.uid());
 end if;
 return ref;
end $function$
;

CREATE OR REPLACE FUNCTION public.i_track_verify_compliance(p_compliance uuid, p_approve boolean, p_reason text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.announcement_compliances%rowtype;
begin
 if not (select private.i_track_is_admin()) then raise exception 'Administrator required';end if;
 select * into c from public.announcement_compliances where id=p_compliance for update;
 if not found or c.status<>'pending_verification' then raise exception 'Submission not pending verification';end if;
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