-- SRII i-TRACK v61: recovery registry, protected upload-log reconciliation, and published update history.
-- Database scan is limited to the Supabase upload ledger. It does not enumerate Google Drive.
-- Admin repair requires proof of the Drive file, original assignment validation, and audit reason.
CREATE TABLE IF NOT EXISTS public.i_track_system_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_kind text NOT NULL CHECK(event_kind IN ('recovery','release')),
 title text NOT NULL CHECK(length(title) BETWEEN 3 AND 160),
 summary text NOT NULL CHECK(length(summary) BETWEEN 3 AND 500),
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES public.profiles(id),
 upload_attempt_id uuid REFERENCES public.upload_attempts(id),
 admin_recovery_reason text
);
CREATE UNIQUE INDEX IF NOT EXISTS i_track_system_events_repaired_attempt
 ON public.i_track_system_events(upload_attempt_id) WHERE upload_attempt_id IS NOT NULL;
ALTER TABLE public.i_track_system_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.i_track_system_events FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.i_track_recovery_apply(p_attempt_id uuid, p_confirm_drive boolean, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE a public.upload_attempts%ROWTYPE;v_submission_id uuid;v_type text;
BEGIN
 IF NOT (SELECT private.i_track_is_admin()) THEN RAISE EXCEPTION 'Administrator approval required' USING ERRCODE='42501'; END IF;
 IF p_confirm_drive IS DISTINCT FROM true OR length(btrim(coalesce(p_reason,'')))<10
 THEN RAISE EXCEPTION 'Confirm the original file in Drive and enter a reason of at least 10 characters'; END IF;
 SELECT * INTO STRICT a FROM public.upload_attempts WHERE id=p_attempt_id FOR UPDATE;
 IF a.drive_file_id IS NULL OR a.status NOT IN ('drive_saved','recorded') THEN
  RAISE EXCEPTION 'This attempt does not contain sufficient confirmed Drive metadata'; END IF;
 IF EXISTS(SELECT 1 FROM public.submissions s WHERE s.drive_file_id=a.drive_file_id)
    OR EXISTS(SELECT 1 FROM public.document_attachments d WHERE d.drive_file_id=a.drive_file_id)
 THEN RAISE EXCEPTION 'File is already registered; refresh the scan'; END IF;
 IF EXISTS(SELECT 1 FROM public.i_track_system_events e WHERE e.upload_attempt_id=a.id)
 THEN RAISE EXCEPTION 'A recovery was already recorded for this attempt'; END IF;
 IF a.assignment_id IS NOT NULL THEN
  IF coalesce(a.reserved_version,1)<>1 OR
    EXISTS(SELECT 1 FROM public.submissions s WHERE s.assignment_id=a.assignment_id) OR
    EXISTS(SELECT 1 FROM public.announcement_compliances c WHERE c.assignment_id=a.assignment_id)
  THEN RAISE EXCEPTION 'Existing submission or verification history requires manual investigation; no records changed'; END IF;
  INSERT INTO public.submissions (
   assignment_id,submitted_by,original_filename,content_type,file_size_bytes,drive_file_id,
   first_received_at,stored_at,storage_status,version_number,verification_status)
  VALUES (a.assignment_id,a.uploaded_by,a.original_filename,a.content_type,a.file_size_bytes,
    a.drive_file_id,a.first_received_at,coalesce(a.stored_at,now()),'uploaded',1,'pending')
  RETURNING id INTO v_submission_id;
  v_type:='announcement';
 ELSE
  IF a.document_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.documents d WHERE d.id=a.document_id)
  THEN RAISE EXCEPTION 'Referenced document is unavailable'; END IF;
  INSERT INTO public.document_attachments(document_id,uploaded_by,original_filename,content_type,
   file_size_bytes,drive_file_id,uploaded_at)
  VALUES(a.document_id,a.uploaded_by,a.original_filename,a.content_type,a.file_size_bytes,
   a.drive_file_id,coalesce(a.stored_at,a.first_received_at))
  RETURNING id INTO v_submission_id;
  v_type:='document';
 END IF;
 UPDATE public.upload_attempts SET status='recorded',updated_at=now() WHERE id=a.id;
 INSERT INTO public.i_track_system_events(event_kind,title,summary,created_by,upload_attempt_id,admin_recovery_reason)
 VALUES('recovery','Missing upload record recovered',
  'An existing '||v_type||' upload was reconnected to SRII i-TRACK after administrator verification. Any required submission approval remains pending.',
  (SELECT auth.uid()),a.id,btrim(p_reason));
 RETURN jsonb_build_object('status','recovered','record_type',v_type,'record_id',v_submission_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.i_track_recovery_scan()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_admin boolean;v_oic boolean;v_rows jsonb;v_total integer;v_linked integer;v_unlinked integer;v_failed integer;
BEGIN
 v_admin:=(SELECT private.i_track_is_admin());
 v_oic:=(SELECT private.i_track_is_oic_psds());
 IF NOT (v_admin OR v_oic) THEN RAISE EXCEPTION 'District administrator or oversight required' USING ERRCODE='42501'; END IF;
 WITH classified AS (
  SELECT a.*,
    (EXISTS(SELECT 1 FROM public.submissions s WHERE s.drive_file_id=a.drive_file_id)
     OR EXISTS(SELECT 1 FROM public.document_attachments d WHERE d.drive_file_id=a.drive_file_id)) AS linked,
    (a.assignment_id IS NOT NULL AND
     NOT EXISTS(SELECT 1 FROM public.submissions s WHERE s.assignment_id=a.assignment_id)
     AND NOT EXISTS(SELECT 1 FROM public.announcement_compliances c WHERE c.assignment_id=a.assignment_id)
     AND coalesce(a.reserved_version,1)=1) AS clean_announcement,
    (a.document_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.documents d WHERE d.id=a.document_id)) AS clean_document
  FROM public.upload_attempts a
 )
 SELECT count(*)::integer,
  count(*) FILTER(WHERE drive_file_id IS NOT NULL AND linked)::integer,
  count(*) FILTER(WHERE drive_file_id IS NOT NULL AND NOT linked)::integer,
  count(*) FILTER(WHERE drive_file_id IS NULL OR status IN ('failed','processing'))::integer
 INTO v_total,v_linked,v_unlinked,v_failed FROM classified;
 WITH findings AS (
  SELECT a.*,s.name AS school_name,
   (EXISTS(SELECT 1 FROM public.submissions sub WHERE sub.drive_file_id=a.drive_file_id)
    OR EXISTS(SELECT 1 FROM public.document_attachments d WHERE d.drive_file_id=a.drive_file_id)) AS linked,
   (a.assignment_id IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM public.submissions sub WHERE sub.assignment_id=a.assignment_id)
    AND NOT EXISTS(SELECT 1 FROM public.announcement_compliances c WHERE c.assignment_id=a.assignment_id)
    AND coalesce(a.reserved_version,1)=1) AS safe_ann,
   (a.document_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.documents d WHERE d.id=a.document_id)) AS safe_doc
  FROM public.upload_attempts a LEFT JOIN public.schools s ON s.id=a.school_id
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id', CASE WHEN v_admin THEN id ELSE NULL END,
  'target',CASE WHEN assignment_id IS NOT NULL THEN 'announcement' ELSE 'document' END,
  'school',coalesce(school_name,'District Office'),
  'file_name',CASE WHEN v_admin THEN original_filename ELSE NULL END,
  'drive_file_id',CASE WHEN v_admin AND drive_file_id IS NOT NULL THEN drive_file_id ELSE NULL END,
  'receipt_at',first_received_at,
  'status',status,
  'issue',CASE WHEN drive_file_id IS NOT NULL AND NOT linked THEN 'missing_database_record'
               ELSE 'unconfirmed_upload' END,
  'recoverable',CASE WHEN v_admin AND drive_file_id IS NOT NULL AND NOT linked
     AND status IN ('drive_saved','recorded') AND (safe_ann OR safe_doc)
     THEN true ELSE false END
 ) ORDER BY first_received_at DESC), '[]'::jsonb) INTO v_rows FROM findings
 WHERE (drive_file_id IS NOT NULL AND NOT linked)
    OR (drive_file_id IS NULL AND status IN ('failed','processing') AND first_received_at < now()-interval '30 minutes');
 RETURN jsonb_build_object('checked_at',now(),'scope','supabase_upload_log_only',
  'total_attempts',v_total,'linked_attempts',v_linked,'missing_database_records',v_unlinked,
  'unconfirmed_attempts',v_failed,'findings',v_rows,'admin',v_admin);
END;
$function$;

CREATE OR REPLACE FUNCTION public.i_track_system_publish_update(p_title text, p_summary text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF NOT (SELECT private.i_track_is_admin()) THEN RAISE EXCEPTION 'District administrator required' USING ERRCODE='42501'; END IF;
 IF length(btrim(coalesce(p_title,''))) NOT BETWEEN 3 AND 160 OR
    length(btrim(coalesce(p_summary,''))) NOT BETWEEN 3 AND 500
 THEN RAISE EXCEPTION 'Invalid update title or summary'; END IF;
 INSERT INTO public.i_track_system_events(event_kind,title,summary,created_by)
 VALUES('release',btrim(p_title),btrim(p_summary),(SELECT auth.uid()));
END;
$function$;

CREATE OR REPLACE FUNCTION public.i_track_system_updates()
 RETURNS TABLE(event_kind text, title text, summary text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT EXISTS
  (SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.account_status='active')
 THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT e.event_kind,e.title,e.summary,e.created_at
 FROM public.i_track_system_events e ORDER BY e.created_at DESC LIMIT 15;
END;
$function$;

REVOKE ALL ON FUNCTION public.i_track_system_updates() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.i_track_recovery_scan() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.i_track_recovery_apply(uuid,boolean,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.i_track_system_publish_update(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.i_track_system_updates() TO authenticated;
GRANT EXECUTE ON FUNCTION public.i_track_recovery_scan() TO authenticated;
GRANT EXECUTE ON FUNCTION public.i_track_recovery_apply(uuid,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.i_track_system_publish_update(text,text) TO authenticated;
