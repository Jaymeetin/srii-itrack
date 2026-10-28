drop policy if exists compliance_read on public.announcement_compliances;
create policy compliance_read on public.announcement_compliances for select to authenticated
using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status='active' and
(p.role in ('main_admin','backup_admin') or p.id=announcement_compliances.submitted_by or
(p.school_id is not null and p.school_id=announcement_compliances.school_id))));