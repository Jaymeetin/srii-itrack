-- v96: shared samples for the requirement checklists (First Salary Claim,
-- Loyalty Pay, Step Increment and the others). Any approved school or
-- District account can share a sample of a document; every signed-in user
-- can open them. Samples of the same document are numbered Version 1, 2, 3…
-- The person who shared a sample, or a District administrator, can remove
-- it; removing only hides it.
-- Additive only. No existing row is changed.

CREATE TABLE IF NOT EXISTS public.requirement_samples (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 doc_key text NOT NULL CHECK (doc_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(doc_key) <= 60),
 version integer NOT NULL CHECK (version > 0),
 note text CHECK (note IS NULL OR length(note) <= 300),
 file_path text NOT NULL UNIQUE CHECK (length(file_path) BETWEEN 10 AND 300),
 file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 180),
 content_type text NOT NULL,
 file_size bigint NOT NULL CHECK (file_size > 0 AND file_size <= 10485760),
 privacy_checked boolean NOT NULL CHECK (privacy_checked),
 uploaded_by uuid NOT NULL,
 uploaded_at timestamptz NOT NULL DEFAULT now(),
 removed_at timestamptz,
 removed_by uuid,
 removed_reason text CHECK (removed_reason IS NULL OR length(removed_reason) <= 300),
 UNIQUE (doc_key, version)
);
ALTER TABLE public.requirement_samples ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.requirement_samples FROM anon, authenticated;

-- A sample file can be opened while its sample is shown; the person who
-- uploaded a file can always open their own.
CREATE FUNCTION private.i_track_sample_file_live(p_name text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 SELECT EXISTS (SELECT 1 FROM public.requirement_samples s WHERE s.file_path = p_name AND s.removed_at IS NULL)
$function$;
REVOKE ALL ON FUNCTION private.i_track_sample_file_live(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.i_track_sample_file_live(text) TO authenticated, service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('requirement-samples', 'requirement-samples', false, 10485760, ARRAY[
 'application/pdf',
 'application/msword',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.ms-excel',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;
CREATE POLICY itrack_samples_read ON storage.objects
 FOR SELECT TO authenticated
 USING (bucket_id = 'requirement-samples' AND (SELECT private.i_track_is_active())
  AND (owner_id = (SELECT auth.uid())::text OR owner = (SELECT auth.uid())
   OR private.i_track_sample_file_live(name)));
CREATE POLICY itrack_samples_add ON storage.objects
 FOR INSERT TO authenticated
 WITH CHECK (bucket_id = 'requirement-samples' AND (SELECT private.i_track_is_operator())
  AND name ~ '^[a-z0-9]+(-[a-z0-9]+)*/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]{1,150}$');

CREATE FUNCTION public.i_track_requirement_samples()
RETURNS TABLE(id uuid, doc_key text, version integer, note text, file_path text, file_name text,
 content_type text, file_size bigint, uploaded_at timestamptz, uploader_name text, school_name text, mine boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 SELECT s.id, s.doc_key, s.version, s.note, s.file_path, s.file_name, s.content_type, s.file_size, s.uploaded_at,
  coalesce(nullif(p.display_name, ''), 'i-TRACK user'), coalesce(sc.name, 'District Office'),
  s.uploaded_by = (SELECT auth.uid())
 FROM public.requirement_samples s
 LEFT JOIN public.profiles p ON p.id = s.uploaded_by
 LEFT JOIN public.schools sc ON sc.id = p.school_id
 WHERE s.removed_at IS NULL AND coalesce((SELECT private.i_track_is_active()), false)
 ORDER BY s.doc_key, s.version DESC
$function$;

CREATE FUNCTION public.i_track_add_requirement_sample(p_doc_key text, p_file_path text, p_file_name text,
 p_content_type text, p_note text, p_privacy_checked boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare
 v_note text := nullif(btrim(coalesce(p_note, '')), '');
 v_name text := left(coalesce(nullif(btrim(coalesce(p_file_name, '')), ''), 'sample'), 180);
 v_size bigint;
 v_type text;
 v_version integer;
 v_id uuid;
begin
 if not coalesce((select private.i_track_is_operator()), false) then
  raise exception 'Only approved school and District accounts can share samples';
 end if;
 if p_doc_key is null or p_doc_key !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_doc_key) > 60 then
  raise exception 'Unknown document';
 end if;
 if p_privacy_checked is not true then
  raise exception 'Cover or remove personal details first, then tick the box';
 end if;
 if v_note is not null and length(v_note) > 300 then
  raise exception 'Note is too long (300 characters at most)';
 end if;
 if p_file_path is null or split_part(p_file_path, '/', 1) <> p_doc_key then
  raise exception 'The file does not belong to this document';
 end if;
 select (o.metadata->>'size')::bigint, coalesce(nullif(o.metadata->>'mimetype', ''), p_content_type)
 into v_size, v_type
 from storage.objects o
 where o.bucket_id = 'requirement-samples' and o.name = p_file_path
  and (o.owner = auth.uid() or o.owner_id = auth.uid()::text);
 if not found then
  raise exception 'The upload was not found. Please try again.';
 end if;
 if v_type is null or v_type not in ('application/pdf', 'application/msword',
   'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
   'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
   'image/jpeg', 'image/png') then
  raise exception 'Use a PDF, Word, Excel, JPG or PNG file';
 end if;
 if (select count(*) from public.requirement_samples s
     where s.uploaded_by = auth.uid() and s.uploaded_at > now() - interval '1 day') >= 20 then
  raise exception 'You shared 20 samples today. Please try again tomorrow.';
 end if;
 perform pg_advisory_xact_lock(hashtext('i_track_requirement_samples:' || p_doc_key));
 select coalesce(max(s.version), 0) + 1 into v_version
 from public.requirement_samples s where s.doc_key = p_doc_key;
 insert into public.requirement_samples(doc_key, version, note, file_path, file_name, content_type,
  file_size, privacy_checked, uploaded_by)
 values (p_doc_key, v_version, v_note, p_file_path, v_name, v_type, greatest(coalesce(v_size, 1), 1), true, auth.uid())
 returning id into v_id;
 insert into public.audit_log(actor_user_id, action, entity_type, entity_id, details)
 values (auth.uid(), 'requirement_sample_added', 'requirement_sample', v_id,
  jsonb_build_object('doc_key', p_doc_key, 'version', v_version, 'file_name', v_name));
 return jsonb_build_object('id', v_id, 'version', v_version);
end
$function$;

CREATE FUNCTION public.i_track_remove_requirement_sample(p_sample uuid, p_reason text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare
 v public.requirement_samples%rowtype;
 v_admin boolean := coalesce((select private.i_track_is_admin()), false);
 v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
 select * into v from public.requirement_samples where id = p_sample and removed_at is null for update;
 if not found then raise exception 'Sample not found'; end if;
 if not (v_admin or v.uploaded_by = auth.uid()) then
  raise exception 'Only the person who shared it or a District administrator can remove it';
 end if;
 if v_admin and v.uploaded_by <> auth.uid() and v_reason is null then
  raise exception 'Give a short reason for removing the sample';
 end if;
 if v_reason is not null and length(v_reason) > 300 then
  raise exception 'Reason is too long (300 characters at most)';
 end if;
 update public.requirement_samples
 set removed_at = now(), removed_by = auth.uid(),
  removed_reason = coalesce(v_reason, 'Removed by the person who shared it')
 where id = v.id;
 insert into public.audit_log(actor_user_id, action, entity_type, entity_id, details)
 values (auth.uid(), 'requirement_sample_removed', 'requirement_sample', v.id,
  jsonb_build_object('doc_key', v.doc_key, 'version', v.version,
   'reason', coalesce(v_reason, 'Removed by the person who shared it')));
 return true;
end
$function$;

REVOKE ALL ON FUNCTION public.i_track_requirement_samples() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.i_track_add_requirement_sample(text, text, text, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.i_track_remove_requirement_sample(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.i_track_requirement_samples() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.i_track_add_requirement_sample(text, text, text, text, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.i_track_remove_requirement_sample(uuid, text) TO authenticated, service_role;
