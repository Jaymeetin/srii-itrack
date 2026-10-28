
-- An announcement can be cancelled without deleting its files, compliance,
-- assignments, original deadline, or audit history.
alter table public.announcements drop constraint if exists announcements_status_check;
alter table public.announcements add constraint announcements_status_check
 check (status in ('draft','open','closed','cancelled'));
alter table public.announcements add column if not exists cancelled_at timestamptz;
alter table public.announcements add column if not exists cancelled_by uuid references public.profiles(id) on delete set null;
alter table public.announcements add column if not exists cancellation_reason text;
alter table public.announcements add constraint announcement_cancellation_details
 check (status <> 'cancelled' or
        (cancelled_at is not null and cancelled_by is not null
          and length(btrim(coalesce(cancellation_reason,''))) >= 5));

create or replace function public.i_track_edit_announcement(
 p_announcement uuid,
 p_title text,
 p_description text,
 p_deadline_at timestamptz,
 p_school_ids uuid[]
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare
 a public.announcements%rowtype;
 school_count integer;
 unique_count integer;
 expected_count integer;
 removed_count integer;
 added_count integer;
 submitted_count integer;
 school_label text;
begin
 if not (select private.i_track_is_admin()) then
   raise exception 'Only a district administrator can edit announcements';
 end if;
 select * into a from public.announcements where id=p_announcement for update;
 if not found then raise exception 'Announcement not found';end if;
 if a.status='cancelled' then
   raise exception 'Cancelled announcements are retained as records and cannot be edited';
 end if;
 if length(btrim(coalesce(p_title,''))) not between 2 and 180 then
   raise exception 'Enter a title between 2 and 180 characters';
 end if;
 if length(coalesce(p_description,''))>5000 then
   raise exception 'Description must be at most 5,000 characters';
 end if;
 if p_deadline_at is null or not isfinite(p_deadline_at) then
   raise exception 'Enter a valid submission deadline';
 end if;
 if p_school_ids is null or cardinality(p_school_ids) not between 1 and 50
 then raise exception 'Choose at least one required school';end if;
 if array_position(p_school_ids,null) is not null then raise exception 'Remove invalid school selections';end if;
 select count(distinct selected.id) into unique_count from unnest(p_school_ids) selected(id);
 if unique_count<>cardinality(p_school_ids) then raise exception 'Duplicate school selection';end if;
 select count(*) into school_count from public.schools s where s.id=any(p_school_ids) and s.is_active;
 if school_count<>unique_count then raise exception 'All selected schools must be active';end if;

 -- Do not orphan responses or change historical assignment IDs.
 select aa.school_id into school_label
 from public.announcement_assignments aa
 where aa.announcement_id=a.id and aa.obligation_status='required'
 and aa.school_id is not null and not (aa.school_id=any(p_school_ids))
 and (exists(select 1 from public.submissions sub where sub.assignment_id=aa.id)
   or exists(select 1 from public.announcement_compliances c where c.assignment_id=aa.id))
 limit 1;
 if found then
  raise exception 'A school already submitted compliance and cannot be removed. Keep it assigned or cancel the entire announcement';
 end if;

 select count(*) into removed_count from public.announcement_assignments aa
 where aa.announcement_id=a.id and aa.obligation_status='required'
 and aa.school_id is not null and not (aa.school_id=any(p_school_ids));
 update public.announcement_assignments aa set obligation_status='removed'
 where aa.announcement_id=a.id and aa.obligation_status='required'
 and aa.school_id is not null and not (aa.school_id=any(p_school_ids));
 select count(*) into added_count from unnest(p_school_ids) x(id)
 where not exists (
   select 1 from public.announcement_assignments aa
   where aa.announcement_id=a.id and aa.school_id=x.id and aa.obligation_status='required'
 );
 insert into public.announcement_assignments(announcement_id,school_id,obligation_status)
 select a.id,selected.id,'required' from unnest(p_school_ids) selected(id)
 on conflict(announcement_id,school_id) do update
   set obligation_status='required'
   where public.announcement_assignments.obligation_status='removed';
 update public.announcements set
   title=btrim(p_title),
   description=nullif(btrim(coalesce(p_description,'')),''),
   deadline_at=p_deadline_at,
   updated_at=now()
 where id=a.id;
 insert into public.audit_log(actor_user_id,action,entity_type,entity_id,details)
 values(auth.uid(),'announcement_edited','announcement',a.id::text,
   jsonb_build_object(
     'previous_title',a.title,'new_title',btrim(p_title),
     'previous_description',a.description,'new_description',p_description,
     'previous_deadline',a.deadline_at,'new_deadline',p_deadline_at,
     'added_required_schools',added_count,'removed_required_schools',removed_count,
     'required_schools',p_school_ids,'original_deadline',a.original_deadline_at));
 return jsonb_build_object('ok',true,'id',a.id,'added_schools',added_count,
       'removed_schools',removed_count,'required_school_count',school_count);
end $fn$;

create or replace function public.i_track_cancel_announcement(
 p_announcement uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare a public.announcements%rowtype; files integer; responses integer;
begin
 if not (select private.i_track_is_admin()) then
   raise exception 'Only district administrators can cancel announcements';
 end if;
 if length(btrim(coalesce(p_reason,''))) not between 5 and 1000 then
   raise exception 'Provide a reason for cancellation (5 to 1,000 characters)';
 end if;
 select * into a from public.announcements where id=p_announcement for update;
 if not found then raise exception 'Announcement not found';end if;
 if a.status='cancelled' then raise exception 'Announcement was already cancelled';end if;
 select count(*) into files from public.submissions s
  join public.announcement_assignments aa on aa.id=s.assignment_id
  where aa.announcement_id=a.id;
 select count(*) into responses from public.announcement_compliances c
  join public.announcement_assignments aa on aa.id=c.assignment_id
  where aa.announcement_id=a.id;
 update public.announcements set status='cancelled',cancelled_at=now(),
  cancelled_by=auth.uid(),cancellation_reason=btrim(p_reason),updated_at=now()
 where id=a.id;
 insert into public.audit_log(actor_user_id,action,entity_type,entity_id,details)
 values(auth.uid(),'announcement_cancelled','announcement',a.id::text,
 jsonb_build_object('previous_status',a.status,'reason',btrim(p_reason),
  'preserved_file_versions',files,'preserved_responses',responses));
 return jsonb_build_object('ok',true,'id',a.id,'status','cancelled',
   'preserved_file_versions',files,'preserved_responses',responses);
end $fn$;

revoke all on function public.i_track_edit_announcement(uuid,text,text,timestamptz,uuid[]) from public,anon;
revoke all on function public.i_track_cancel_announcement(uuid,text) from public,anon;
grant execute on function public.i_track_edit_announcement(uuid,text,text,timestamptz,uuid[]) to authenticated;
grant execute on function public.i_track_cancel_announcement(uuid,text) to authenticated;
