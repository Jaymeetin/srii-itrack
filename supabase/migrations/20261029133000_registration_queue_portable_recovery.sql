-- SRII i-TRACK: issue a replacement private access link without resetting the queue slot.
-- Only approved district administrators can perform this; the old bearer ticket is revoked.
CREATE OR REPLACE FUNCTION public.i_track_admin_reissue_queue_access(p_queue_number bigint)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_id uuid; v_new_ticket uuid;
BEGIN
 IF NOT (SELECT private.i_track_is_admin()) THEN
  RAISE EXCEPTION 'Only active district administrators may recover registration queue access.' USING ERRCODE='42501';
 END IF;
 SELECT q.id INTO v_id
 FROM public.registration_email_queue q
 WHERE q.queue_number=p_queue_number
  AND q.status IN ('waiting','claimed')
  AND pg_catalog.now()<q.expires_at
 FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'This queue place is not active. Ask the applicant to join a new queue if their window has expired.' USING ERRCODE='P0001';
 END IF;
 v_new_ticket:=pg_catalog.gen_random_uuid();
 UPDATE public.registration_email_queue SET ticket=v_new_ticket WHERE id=v_id;
 RETURN v_new_ticket;
END;
$function$;
REVOKE ALL ON FUNCTION public.i_track_admin_reissue_queue_access(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.i_track_admin_reissue_queue_access(bigint) TO authenticated;
