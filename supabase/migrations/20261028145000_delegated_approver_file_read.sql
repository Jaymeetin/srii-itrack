create policy delegated_announcement_approver_may_read_files
on public.submissions for select to authenticated using (
 (select private.i_track_is_active())
 and exists(
  select 1 from public.announcement_assignments aa
  join public.announcement_approvers ap on ap.announcement_id=aa.announcement_id
  join public.profiles actor on actor.id=ap.user_id
  join auth.users authorized on authorized.id=actor.id
  where aa.id=submissions.assignment_id
   and ap.user_id=(select auth.uid())
   and actor.account_status='active'
   and authorized.email_confirmed_at is not null
 )
);