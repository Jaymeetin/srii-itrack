-- v92: the OIC-PSDS may open (read only) every announcement submission file.
-- One SELECT policy is added; no insert, update or delete rights are given.
-- The oversight list now also returns the submission id, file type, size and
-- copy type so the app can show an Open button next to each upload.
-- No existing row is changed.

DROP POLICY IF EXISTS oic_psds_may_read_announcement_files ON public.submissions;
CREATE POLICY oic_psds_may_read_announcement_files ON public.submissions
 FOR SELECT TO authenticated
 USING (
  (SELECT private.i_track_is_oic_psds())
  AND (SELECT private.i_track_current_user_email_confirmed())
 );

DROP FUNCTION IF EXISTS public.i_track_oversight_announcement_uploads(uuid);
CREATE FUNCTION public.i_track_oversight_announcement_uploads(
 p_announcement_id uuid DEFAULT NULL
)
RETURNS TABLE(
 announcement_id uuid,
 announcement_code text,
 announcement_title text,
 school_id uuid,
 school_name text,
 original_filename text,
 version_number integer,
 uploaded_at timestamptz,
 uploader_name text,
 verification_status text,
 storage_status text,
 submission_id uuid,
 content_type text,
 file_size_bytes bigint,
 copy_type text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 SELECT ann.id, ann.announcement_code, ann.title,
  coalesce(aa.school_id, sub.representing_school_id),
  coalesce(s.name, 'District Office'),
  sub.original_filename,
  sub.version_number,
  coalesce(sub.first_received_at, sub.created_at),
  coalesce(nullif(sub.uploader_name_at_submission, ''), nullif(p.display_name, ''), 'Unknown uploader'),
  sub.verification_status,
  sub.storage_status,
  sub.id,
  sub.content_type,
  sub.file_size_bytes,
  sub.copy_type
 FROM public.submissions sub
 JOIN public.announcement_assignments aa ON aa.id = sub.assignment_id
 JOIN public.announcements ann ON ann.id = aa.announcement_id
 LEFT JOIN public.schools s ON s.id = coalesce(aa.school_id, sub.representing_school_id)
 LEFT JOIN public.profiles p ON p.id = sub.submitted_by
 WHERE ((SELECT private.i_track_is_admin()) OR (SELECT private.i_track_is_oic_psds()))
  AND (p_announcement_id IS NULL OR aa.announcement_id = p_announcement_id)
  AND sub.storage_status IN ('uploaded', 'archived')
 ORDER BY coalesce(sub.first_received_at, sub.created_at) DESC, sub.id DESC
 LIMIT 2000
$function$;
REVOKE ALL ON FUNCTION public.i_track_oversight_announcement_uploads(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.i_track_oversight_announcement_uploads(uuid) TO authenticated, service_role;
