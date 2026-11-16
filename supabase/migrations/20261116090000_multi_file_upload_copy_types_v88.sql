-- v88: several files in one submission, and a copy type on every uploaded file.
--
-- * copy_type   'proof' | 'soft_copy' | 'scanned_copy' (NULL for files uploaded before v88)
-- * batch_id    files uploaded together for one announcement requirement share a batch
--               and therefore one submission version; verification covers the whole batch.
--
-- Additive only: no existing row is changed or removed. Google Drive filenames and
-- folders keep their current rule, so the Apps Script receiver is untouched.

alter table public.upload_attempts
  add column if not exists copy_type text,
  add column if not exists batch_id uuid;
alter table public.submissions
  add column if not exists copy_type text,
  add column if not exists batch_id uuid;
alter table public.document_attachments
  add column if not exists copy_type text;

alter table public.upload_attempts drop constraint if exists upload_attempts_copy_type_check;
alter table public.upload_attempts add constraint upload_attempts_copy_type_check
  check (copy_type is null or copy_type in ('proof','soft_copy','scanned_copy'));
alter table public.submissions drop constraint if exists submissions_copy_type_check;
alter table public.submissions add constraint submissions_copy_type_check
  check (copy_type is null or copy_type in ('proof','soft_copy','scanned_copy'));
alter table public.document_attachments drop constraint if exists document_attachments_copy_type_check;
alter table public.document_attachments add constraint document_attachments_copy_type_check
  check (copy_type is null or copy_type in ('proof','soft_copy','scanned_copy'));

create index if not exists submissions_assignment_batch_idx
  on public.submissions (assignment_id, batch_id) where batch_id is not null;
create index if not exists upload_attempts_assignment_batch_idx
  on public.upload_attempts (assignment_id, batch_id) where batch_id is not null;

-- One reserved version per requirement still holds for single-file uploads. Files of the
-- same batch intentionally share a version; the assignment row lock in the two functions
-- below keeps their numbering consistent.
drop index if exists public.upload_attempts_reserved_version_ux;
create unique index upload_attempts_reserved_version_ux
  on public.upload_attempts (assignment_id, reserved_version)
  where assignment_id is not null and reserved_version is not null
    and status <> 'failed' and batch_id is null;

create or replace function public.i_track_reserve_upload_filename(p_upload_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_upload public.upload_attempts%rowtype;
  v_code text;
  v_school text;
  v_tracking text;
  v_ext text;
  v_tag text;
  v_version integer;
  v_latest integer;
  v_filename text;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Service role required';
  end if;
  select * into v_upload from public.upload_attempts
  where id=p_upload_id for update;
  if not found then raise exception 'Upload receipt was not found'; end if;
  if v_upload.stored_filename is not null then
    return v_upload.stored_filename;
  end if;
  if v_upload.status <> 'processing' then
    raise exception 'Upload receipt is not eligible for naming';
  end if;

  v_ext:=lower(substring(v_upload.original_filename from '\.[A-Za-z0-9]+$'));
  if v_ext is null or v_ext not in ('.pdf','.doc','.docx','.jpg','.jpeg','.png','.webp') then
    raise exception 'Invalid upload extension';
  end if;
  v_tag:=upper(left(replace(v_upload.id::text,'-',''),8));

  if v_upload.assignment_id is not null then
    -- Use the very same assignment lock as the finalizer, avoiding version races.
    perform 1 from public.announcement_assignments aa
      where aa.id=v_upload.assignment_id for update;
    if not found then raise exception 'Assigned announcement not found'; end if;
    if exists (
      select 1 from public.upload_attempts other
      where other.assignment_id=v_upload.assignment_id
        and other.id<>p_upload_id
        and other.status in ('processing','drive_saved')
        and other.reserved_version is not null
    ) then
      raise exception 'Another upload for this requirement is still processing';
    end if;
    select ann.announcement_code,s.name
      into v_code,v_school
      from public.announcement_assignments aa
      join public.announcements ann on ann.id=aa.announcement_id
      left join public.schools s on s.id=coalesce(aa.school_id,v_upload.school_id)
      where aa.id=v_upload.assignment_id;
    if v_code is null then raise exception 'Announcement code not available'; end if;
    v_school:=btrim(left(regexp_replace(upper(coalesce(v_school,'SCHOOL')),
                               '[^A-Z0-9]+','-','g'),48),'-');
    if v_school='' then v_school:='SCHOOL'; end if;
    select coalesce(max(s.version_number),0) into v_latest
      from public.submissions s where s.assignment_id=v_upload.assignment_id;
    -- A file joins the version of its own batch only while that batch is still the
    -- newest submission; otherwise it starts the next version.
    if v_upload.batch_id is not null then
      select max(s.version_number) into v_version
        from public.submissions s
        where s.assignment_id=v_upload.assignment_id and s.batch_id=v_upload.batch_id;
    end if;
    if v_version is null or v_version<v_latest then
      v_version:=v_latest+1;
    end if;
    v_filename:=v_code||'_'||v_school||'_V'||v_version::text||'_U'||v_tag||v_ext;
  else
    select tracking_number into v_tracking
      from public.documents where id=v_upload.document_id;
    if v_tracking is null then raise exception 'Routed document not found'; end if;
    v_filename:=v_tracking||'_ATT-U'||v_tag||v_ext;
  end if;

  if length(v_filename)>180 then raise exception 'Stored filename is too long'; end if;
  update public.upload_attempts
    set reserved_version=v_version,
        stored_filename=v_filename,
        updated_at=now()
    where id=p_upload_id;
  return v_filename;
end
$function$;

create or replace function public.i_track_finalize_drive_upload(p_upload_id uuid, p_drive_file_id text)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  upload public.upload_attempts%rowtype;
  result_id uuid;
  latest public.submissions%rowtype;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Service role required';
  end if;
  if p_drive_file_id is null or
     p_drive_file_id !~ '^[A-Za-z0-9_-]{10,200}$' then
     raise exception 'Invalid Drive file identifier';
  end if;
  select * into upload
    from public.upload_attempts
    where id=p_upload_id
    for update;
  if not found then raise exception 'Upload receipt not found'; end if;

  if upload.status='recorded' then
    if upload.drive_file_id is distinct from p_drive_file_id then
      raise exception 'Upload already linked to another file';
    end if;
    if upload.assignment_id is not null then
      select s.id into result_id from public.submissions s
      where s.drive_file_id=p_drive_file_id;
    else
      select a.id into result_id from public.document_attachments a
      where a.drive_file_id=p_drive_file_id;
    end if;
    return result_id;
  end if;
  if upload.status not in ('processing','drive_saved')
     or (upload.drive_file_id is not null and upload.drive_file_id<>p_drive_file_id) then
    raise exception 'Upload receipt not eligible for finalization';
  end if;

  update public.upload_attempts set
    drive_file_id=p_drive_file_id,
    stored_at=coalesce(stored_at,now()),
    status='drive_saved',updated_at=now()
    where id=p_upload_id;

  if upload.assignment_id is not null then
    -- Lock the assignment to serialize versions of the same requirement.
    perform 1 from public.announcement_assignments aa
      where aa.id=upload.assignment_id
      for update;
    if not found then raise exception 'Announcement assignment missing'; end if;
    -- Match the reserved Drive filename to the final submission version.
    if upload.reserved_version is not null then
      if upload.stored_filename is null then
        raise exception 'Reserved upload has no stored filename';
      end if;
      -- A later version must not exist, and the same version may only hold files
      -- that were uploaded together in this batch.
      if exists (
        select 1 from public.submissions s
        where s.assignment_id=upload.assignment_id
          and (s.version_number>upload.reserved_version
               or (s.version_number=upload.reserved_version
                   and (upload.batch_id is null or s.batch_id is distinct from upload.batch_id)))
      ) then
        raise exception 'Reserved submission version is already used';
      end if;
      select s.* into latest from public.submissions s
        where s.assignment_id=upload.assignment_id
          and s.version_number<upload.reserved_version
        order by s.version_number desc,s.created_at desc limit 1;
    else
      -- Legacy in-flight uploads may finish without a filename reservation.
      select s.* into latest from public.submissions s
        where s.assignment_id=upload.assignment_id
        order by s.version_number desc,s.created_at desc limit 1;
    end if;
    insert into public.submissions (
      assignment_id,submitted_by,original_filename,content_type,file_size_bytes,
      drive_file_id,first_received_at,stored_at,storage_status,
      version_number,replaces_submission_id,copy_type,batch_id
    ) values (
      upload.assignment_id,upload.uploaded_by,upload.original_filename,
      upload.content_type,upload.file_size_bytes,p_drive_file_id,
      upload.first_received_at,coalesce(upload.stored_at,now()),'uploaded',
      coalesce(upload.reserved_version,coalesce(latest.version_number,0)+1),latest.id,
      upload.copy_type,upload.batch_id
    ) returning id into result_id;
  else
    insert into public.document_attachments (
      document_id,uploaded_by,original_filename,content_type,file_size_bytes,
      drive_file_id,uploaded_at,copy_type
    ) values (
      upload.document_id,upload.uploaded_by,upload.original_filename,
      upload.content_type,upload.file_size_bytes,p_drive_file_id,
      coalesce(upload.stored_at,now()),upload.copy_type
    ) returning id into result_id;
    insert into public.document_events(document_id,actor_user_id,event_type,note)
    values (upload.document_id,upload.uploaded_by,'file_attached',upload.original_filename);
  end if;

  update public.upload_attempts set status='recorded',updated_at=now()
    where id=p_upload_id;
  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,details)
    values (upload.uploaded_by,'file_uploaded',
      case when upload.assignment_id is null then 'document_attachment' else 'submission' end,
      result_id::text,jsonb_build_object('upload_id',p_upload_id));
  return result_id;
end;
$function$;

-- Approving or returning a school response now covers every file uploaded together
-- with the current one, so a multi-file submission is never left half reviewed.
create or replace function public.i_track_verify_compliance(p_compliance uuid, p_approve boolean, p_reason text default null::text)
 returns boolean
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
 c public.announcement_compliances%rowtype;
 v_batch uuid;
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
  select s.batch_id into v_batch from public.submissions s where s.id=c.current_submission_id;
  update public.submissions set verification_status=case when p_approve then 'verified' else 'rejected' end,verified_by=auth.uid(),verified_at=now()
  where verification_status='pending'
    and (id=c.current_submission_id
         or (v_batch is not null and assignment_id=c.assignment_id and batch_id=v_batch));
 end if;
 update public.announcement_compliances set status=case when p_approve then 'verified' else 'returned' end,
 verified_by=auth.uid(),verified_at=now(),return_reason=case when p_approve then null else btrim(p_reason) end,updated_at=now()
 where id=c.id;
 insert into public.audit_log(actor_user_id,action,entity_type,entity_id)
 values(auth.uid(),case when p_approve then 'compliance_verified' else 'compliance_returned' end,'announcement_compliance',c.id::text);
 return true;
end $function$;
