-- v89: accept Excel (.xls, .xlsx) and PowerPoint (.ppt, .pptx) uploads.
-- Only the list of allowed extensions changes; the rest of the function is
-- exactly as installed by v88. No table or existing record is changed.

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
  if v_ext is null or v_ext not in ('.pdf','.doc','.docx','.xls','.xlsx','.ppt','.pptx','.jpg','.jpeg','.png','.webp') then
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
