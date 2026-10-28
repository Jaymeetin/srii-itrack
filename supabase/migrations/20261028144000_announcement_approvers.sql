create table if not exists public.announcement_approvers(
 announcement_id uuid not null references public.announcements(id) on delete cascade,
 user_id uuid not null references public.profiles(id),
 assigned_by uuid references public.profiles(id),
 assigned_at timestamptz not null default now(),
 primary key(announcement_id,user_id)
);
alter table public.announcement_approvers enable row level security;
revoke all on public.announcement_approvers from anon;
grant select on public.announcement_approvers to authenticated;
create policy approved_announcement_approvers_select on public.announcement_approvers
 for select to authenticated using (
  exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.account_status='active' and
    (p.role in ('main_admin','backup_admin') or p.id=announcement_approvers.user_id))
 );
create or replace function public.i_track_set_announcement_approvers(
 p_announcement uuid,p_user_ids uuid[] default '{}'
) returns integer language plpgsql security definer set search_path='' as $fn$
declare n integer; expected integer;
begin
 if not (select private.i_track_is_admin()) then raise exception 'District administrator required'; end if;
 if not exists(select 1 from public.announcements where id=p_announcement) then raise exception 'Announcement not found'; end if;
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
end $fn$;
create or replace function public.i_track_approver_assignments()
returns table(announcement_id uuid,user_id uuid,display_name text)
language sql stable security definer set search_path='' as $fn$
 select a.announcement_id,a.user_id,p.display_name
 from public.announcement_approvers a join public.profiles p on p.id=a.user_id
 join public.profiles viewer on viewer.id=auth.uid()
 where viewer.account_status='active' and (viewer.role in ('main_admin','backup_admin') or
  (a.user_id=auth.uid() and p.account_status='active'))
 order by a.assigned_at,a.user_id
$fn$;
create or replace function public.i_track_create_announcement_with_approvers(
 p_title text,p_description text,p_deadline_at timestamptz,
 p_school_ids uuid[],p_approver_ids uuid[] default '{}'
) returns uuid language plpgsql security definer set search_path='' as $fn$
declare created uuid;
begin
 created:=public.i_track_create_announcement(p_title,p_description,p_deadline_at,p_school_ids);
 perform public.i_track_set_announcement_approvers(created,p_approver_ids);
 return created;
end $fn$;
revoke all on function public.i_track_set_announcement_approvers(uuid,uuid[]) from public,anon;
revoke all on function public.i_track_approver_assignments() from public,anon;
revoke all on function public.i_track_create_announcement_with_approvers(text,text,timestamptz,uuid[],uuid[]) from public,anon;
grant execute on function public.i_track_set_announcement_approvers(uuid,uuid[]) to authenticated;
grant execute on function public.i_track_approver_assignments() to authenticated;
grant execute on function public.i_track_create_announcement_with_approvers(text,text,timestamptz,uuid[],uuid[]) to authenticated;