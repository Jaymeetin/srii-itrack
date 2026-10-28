
create or replace function public.i_track_announcement_editor_data(p_announcement uuid)
returns jsonb language sql stable security definer set search_path='' as $fn$
 select jsonb_build_object(
  'announcement_id',a.id,
  'school_ids',coalesce((
    select jsonb_agg(aa.school_id order by aa.school_id)
    from public.announcement_assignments aa
    where aa.announcement_id=a.id and aa.school_id is not null and aa.obligation_status='required'
  ),'[]'::jsonb),
  'protected_school_ids',coalesce((
    select jsonb_agg(aa.school_id order by aa.school_id)
    from public.announcement_assignments aa
    where aa.announcement_id=a.id and aa.school_id is not null and aa.obligation_status='required'
    and (exists(select 1 from public.submissions s where s.assignment_id=aa.id)
      or exists(select 1 from public.announcement_compliances c where c.assignment_id=aa.id))
  ),'[]'::jsonb),
  'approver_ids',coalesce((
    select jsonb_agg(ap.user_id order by ap.user_id)
    from public.announcement_approvers ap where ap.announcement_id=a.id
  ),'[]'::jsonb)
 )
 from public.announcements a
 where a.id=p_announcement and (select private.i_track_is_admin())
$fn$;

create or replace function public.i_track_update_announcement(
 p_announcement uuid,
 p_title text,
 p_description text,
 p_deadline_at timestamptz,
 p_school_ids uuid[],
 p_approver_ids uuid[] default '{}'
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare res jsonb;
begin
 res:=public.i_track_edit_announcement(
   p_announcement,p_title,p_description,p_deadline_at,p_school_ids
 );
 perform public.i_track_set_announcement_approvers(p_announcement,p_approver_ids);
 return res;
end $fn$;

revoke all on function public.i_track_announcement_editor_data(uuid) from public,anon;
revoke all on function public.i_track_update_announcement(uuid,text,text,timestamptz,uuid[],uuid[]) from public,anon;
grant execute on function public.i_track_announcement_editor_data(uuid) to authenticated;
grant execute on function public.i_track_update_announcement(uuid,text,text,timestamptz,uuid[],uuid[]) to authenticated;
