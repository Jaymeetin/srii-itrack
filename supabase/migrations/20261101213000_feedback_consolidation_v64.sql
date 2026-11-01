-- v64: activate existing user_feedback submission path and add administrator response workflow.
-- Existing RLS: active user may insert/read only own reports, active district admins may read all.
GRANT INSERT (submitted_by,category,subject,message) ON public.user_feedback TO authenticated;
CREATE OR REPLACE FUNCTION public.i_track_admin_feedback_respond(p_feedback_id bigint, p_status text, p_response text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT (SELECT private.i_track_is_admin()) THEN
  RAISE EXCEPTION 'Only active district administrators may respond to reports and suggestions'
    USING ERRCODE='42501';
 END IF;
 IF p_status NOT IN ('submitted','reviewing','resolved') THEN
  RAISE EXCEPTION 'Invalid feedback status';
 END IF;
 IF length(btrim(coalesce(p_response,'')))>2000 THEN
  RAISE EXCEPTION 'Administrator reply must be under 2000 characters';
 END IF;
 UPDATE public.user_feedback
 SET status=p_status,
     admin_response=NULLIF(btrim(coalesce(p_response,'')),''),
     reviewed_by=(SELECT auth.uid()),
     reviewed_at=pg_catalog.now()
 WHERE id=p_feedback_id;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'The selected report could not be found';
 END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.i_track_admin_feedback_respond(bigint,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.i_track_admin_feedback_respond(bigint,text,text) TO authenticated;
