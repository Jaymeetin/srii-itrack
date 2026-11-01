-- v62: record upload announcement misassignment corrections without changing original file or timestamps.
-- Live-data correction of Rizal ES was performed separately after strict one-to-one validation.
CREATE TABLE IF NOT EXISTS public.i_track_submission_reassignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 submission_id uuid NOT NULL REFERENCES public.submissions(id),
 upload_attempt_id uuid REFERENCES public.upload_attempts(id),
 from_assignment_id uuid NOT NULL REFERENCES public.announcement_assignments(id),
 to_assignment_id uuid NOT NULL REFERENCES public.announcement_assignments(id),
 reason text NOT NULL,
 corrected_at timestamptz NOT NULL DEFAULT now(),
 corrected_by uuid REFERENCES public.profiles(id)
);
ALTER TABLE public.i_track_submission_reassignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.i_track_submission_reassignments FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.i_track_recovery_reassign(p_submission_id uuid, p_target_assignment_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE s public.submissions%ROWTYPE;v_from public.announcement_assignments%ROWTYPE;
v_to public.announcement_assignments%ROWTYPE; v_attempt public.upload_attempts%ROWTYPE;
v_compliance public.announcement_compliances%ROWTYPE;
BEGIN
 IF NOT (SELECT private.i_track_is_admin()) THEN
  RAISE EXCEPTION 'Only a district administrator can correct announcement assignments' USING ERRCODE='42501';
 END IF;
 IF length(btrim(coalesce(p_reason,'')))<15 THEN
  RAISE EXCEPTION 'Document why the original announcement was incorrect (15 characters minimum)'; END IF;
 SELECT * INTO STRICT s FROM public.submissions WHERE id=p_submission_id FOR UPDATE;
 IF s.verification_status<>'pending' OR s.version_number<>1 OR s.storage_status<>'uploaded'
 THEN RAISE EXCEPTION 'Already reviewed or versioned submissions require manual administrator investigation'; END IF;
 SELECT * INTO STRICT v_from FROM public.announcement_assignments WHERE id=s.assignment_id FOR UPDATE;
 SELECT * INTO STRICT v_to FROM public.announcement_assignments WHERE id=p_target_assignment_id FOR UPDATE;
 IF v_from.id=v_to.id OR v_from.school_id IS DISTINCT FROM v_to.school_id
    OR v_to.obligation_status<>'required'
    OR NOT EXISTS(SELECT 1 FROM public.announcements an WHERE an.id=v_to.announcement_id AND an.status='open')
 THEN RAISE EXCEPTION 'Target must be a different, open requirement for the same school'; END IF;
 IF EXISTS(SELECT 1 FROM public.submissions old WHERE old.assignment_id=v_to.id)
    OR EXISTS(SELECT 1 FROM public.announcement_compliances old WHERE old.assignment_id=v_to.id)
    OR (SELECT count(*) FROM public.submissions old WHERE old.assignment_id=v_from.id)<>1
 THEN RAISE EXCEPTION 'Existing submission history prevents automatic reassignment; no records changed'; END IF;
 SELECT * INTO STRICT v_compliance FROM public.announcement_compliances
 WHERE assignment_id=v_from.id AND current_submission_id=s.id AND status='pending_verification'
 FOR UPDATE;
 SELECT * INTO STRICT v_attempt FROM public.upload_attempts
 WHERE drive_file_id=s.drive_file_id AND assignment_id=v_from.id AND status='recorded'
 FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.i_track_submission_reassignments h WHERE h.submission_id=s.id)
 THEN RAISE EXCEPTION 'This submission was already reassigned; refresh first'; END IF;
 UPDATE public.submissions SET assignment_id=v_to.id WHERE id=s.id;
 UPDATE public.announcement_compliances SET assignment_id=v_to.id,
  school_id=v_to.school_id,updated_at=now() WHERE id=v_compliance.id;
 UPDATE public.upload_attempts SET assignment_id=v_to.id,updated_at=now() WHERE id=v_attempt.id;
 INSERT INTO public.i_track_submission_reassignments(
  submission_id,upload_attempt_id,from_assignment_id,to_assignment_id,reason,corrected_by)
 VALUES(s.id,v_attempt.id,v_from.id,v_to.id,btrim(p_reason),(SELECT auth.uid()));
 INSERT INTO public.i_track_system_events(event_kind,title,summary,created_by,upload_attempt_id)
 VALUES('recovery','Incorrect announcement association corrected',
 'An uploaded file was reassigned to the intended school announcement. Its receipt date and pending verification remain unchanged.',
 (SELECT auth.uid()),v_attempt.id);
 RETURN jsonb_build_object('status','reassigned','submission_id',s.id,'new_assignment',v_to.id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.i_track_recovery_review_assignments()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_admin boolean;v_oic boolean;v_total integer;v_items jsonb;
BEGIN
 v_admin:=(SELECT private.i_track_is_admin());
 v_oic:=(SELECT private.i_track_is_oic_psds());
 IF NOT (v_admin OR v_oic) THEN
  RAISE EXCEPTION 'District administrator or OIC-PSDS oversight required' USING ERRCODE='42501';
 END IF;
 SELECT count(*)::int INTO v_total
 FROM public.submissions s
 JOIN public.announcement_assignments aa ON aa.id=s.assignment_id
 JOIN public.announcements an ON an.id=aa.announcement_id
 WHERE an.title ILIKE '%SYSTEM TEST%'
  AND s.verification_status='pending'
  AND s.original_filename NOT ILIKE '%sample%'
  AND s.original_filename NOT ILIKE '%test%';
 IF v_admin THEN
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'submission_id',x.submission_id,
   'filename',x.filename,
   'school_name',x.school_name,
   'source_title',x.source_title,
   'first_received_at',x.received_at,
   'target_options',x.options
 ) ORDER BY x.received_at DESC),'[]'::jsonb) INTO v_items
 FROM (
  SELECT s.id AS submission_id,s.original_filename AS filename,
   sch.name AS school_name, an.title AS source_title,s.first_received_at AS received_at,
   (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'assignment_id',target.id,'announcement',target_an.title,
      'announcement_code',target_an.announcement_code
    ) ORDER BY target_an.title),'[]'::jsonb)
    FROM public.announcement_assignments target
    JOIN public.announcements target_an ON target_an.id=target.announcement_id
    WHERE target.school_id=aa.school_id
     AND target.id<>aa.id AND target.obligation_status='required'
     AND target_an.status='open'
     AND NOT EXISTS(SELECT 1 FROM public.submissions ss WHERE ss.assignment_id=target.id)
     AND NOT EXISTS(SELECT 1 FROM public.announcement_compliances cc WHERE cc.assignment_id=target.id)
     AND EXISTS (
      SELECT 1 FROM regexp_split_to_table(lower(regexp_replace(s.original_filename,'[.][^.]+$','')),'[^a-z0-9]+') AS word
      WHERE length(word)>=4
       AND word NOT IN ('school','report','documentation','document','sample','submitted','upload','2026','2025','2024','original')
       AND position(word in lower(target_an.title))>0
     )
   ) AS options
  FROM public.submissions s
  JOIN public.announcement_assignments aa ON aa.id=s.assignment_id
  JOIN public.announcements an ON an.id=aa.announcement_id
  LEFT JOIN public.schools sch ON sch.id=aa.school_id
  WHERE an.title ILIKE '%SYSTEM TEST%'
    AND s.verification_status='pending' AND s.version_number=1
    AND s.original_filename NOT ILIKE '%sample%'
    AND s.original_filename NOT ILIKE '%test%'
  ORDER BY s.first_received_at DESC LIMIT 100
 ) x;
 ELSE v_items:='[]'::jsonb;
 END IF;
 RETURN jsonb_build_object('potentially_misfiled_count',v_total,
  'items',v_items,'checked_at',now(),'review_note',
  'Filename heuristics identify possible misassignments, not confirmed errors. Never reassign automatically.');
END;
$function$;

REVOKE ALL ON FUNCTION public.i_track_recovery_review_assignments() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.i_track_recovery_reassign(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.i_track_recovery_review_assignments() TO authenticated;
GRANT EXECUTE ON FUNCTION public.i_track_recovery_reassign(uuid,uuid,text) TO authenticated;
