-- v95: proof-of-handover photos for Division and District transmittals.
-- A person who hands documents over can add a photo of the receiver holding
-- them. The app prints the transmittal number, the receiver's name, the date
-- and time, and who took it onto the photo before uploading it.
-- Additive only. No existing row is changed.

-------------------------------------------------------------------------
-- 1. Who may see and who may add proof photos.
--    See: the same people who can open the transmittal in i-TRACK, plus the
--    owners and senders of the documents in it, and District administrators.
--    Add: the person who prepared the transmittal, the person bringing it,
--    or a District administrator.
-------------------------------------------------------------------------
CREATE FUNCTION private.i_track_can_see_proof(p_kind text, p_transmittal uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 SELECT coalesce((SELECT private.i_track_is_operator()), false) AND (
  coalesce((SELECT private.i_track_is_admin()), false)
  OR (p_kind = 'division' AND EXISTS (
   SELECT 1 FROM public.division_transmittals t
   WHERE t.id = p_transmittal AND (
    t.prepared_by = (SELECT auth.uid()) OR t.assigned_submitter = (SELECT auth.uid())
    OR EXISTS (
     SELECT 1 FROM public.division_transmittal_items i
     LEFT JOIN public.documents d ON d.id = i.document_id
     LEFT JOIN public.announcement_compliances c ON c.id = i.compliance_id
     WHERE i.transmittal_id = t.id AND (
      i.rightful_owner_id = (SELECT auth.uid()) OR i.submitted_by = (SELECT auth.uid())
      OR d.created_by = (SELECT auth.uid()) OR d.rightful_owner_id = (SELECT auth.uid())
      OR c.submitted_by = (SELECT auth.uid())
      OR (c.school_id IS NOT NULL AND c.school_id = (SELECT private.i_track_my_school_id()))
      OR (i.document_id IS NOT NULL AND coalesce((SELECT private.i_track_can_view_document(i.document_id)), false)))))))
  OR (p_kind = 'district' AND EXISTS (
   SELECT 1 FROM public.district_transmittals t
   WHERE t.id = p_transmittal AND (
    t.prepared_by = (SELECT auth.uid())
    OR EXISTS (
     SELECT 1 FROM public.district_transmittal_items i
     JOIN public.documents d ON d.id = i.document_id
     WHERE i.transmittal_id = t.id AND (
      d.created_by = (SELECT auth.uid()) OR d.rightful_owner_id = (SELECT auth.uid())
      OR i.submitted_by = (SELECT auth.uid()) OR i.final_received_by = (SELECT auth.uid())))))))
$function$;

CREATE FUNCTION private.i_track_can_add_proof(p_kind text, p_transmittal uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 SELECT coalesce((SELECT private.i_track_is_operator()), false) AND (
  (p_kind = 'division' AND EXISTS (
   SELECT 1 FROM public.division_transmittals t
   WHERE t.id = p_transmittal AND t.status <> 'cancelled'
    AND (t.prepared_by = (SELECT auth.uid()) OR t.assigned_submitter = (SELECT auth.uid())
     OR coalesce((SELECT private.i_track_is_admin()), false))))
  OR (p_kind = 'district' AND EXISTS (
   SELECT 1 FROM public.district_transmittals t
   WHERE t.id = p_transmittal
    AND (t.prepared_by = (SELECT auth.uid()) OR coalesce((SELECT private.i_track_is_admin()), false)))))
$function$;

-- Photo files are stored as <kind>/<transmittal id>/<random id>.jpg
CREATE FUNCTION private.i_track_proof_path_allowed(p_name text, p_write boolean)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
declare v_kind text; v_id uuid;
begin
 if p_name is null or p_name !~ '^(division|district)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]jpg$' then
  return false;
 end if;
 v_kind := split_part(p_name, '/', 1);
 v_id := split_part(p_name, '/', 2)::uuid;
 if p_write then
  return coalesce(private.i_track_can_add_proof(v_kind, v_id), false);
 end if;
 return coalesce(private.i_track_can_see_proof(v_kind, v_id), false);
end
$function$;

-------------------------------------------------------------------------
-- 2. Private storage for the photos (JPEG only, 5 MB at most; the app
--    makes them about 0.3 MB).
-------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('proof-photos', 'proof-photos', false, 5242880, ARRAY['image/jpeg'])
ON CONFLICT (id) DO NOTHING;
CREATE POLICY itrack_proof_photos_read ON storage.objects
 FOR SELECT TO authenticated
 USING (bucket_id = 'proof-photos' AND private.i_track_proof_path_allowed(name, false));
CREATE POLICY itrack_proof_photos_add ON storage.objects
 FOR INSERT TO authenticated
 WITH CHECK (bucket_id = 'proof-photos' AND private.i_track_proof_path_allowed(name, true));

-------------------------------------------------------------------------
-- 3. The photo records. Read and written only through the functions below.
-------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proof_photos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 kind text NOT NULL CHECK (kind IN ('division', 'district')),
 transmittal_id uuid NOT NULL,
 file_path text NOT NULL UNIQUE CHECK (length(file_path) BETWEEN 10 AND 200),
 receiver_name text NOT NULL CHECK (length(btrim(receiver_name)) BETWEEN 2 AND 120),
 receiver_position text CHECK (receiver_position IS NULL OR length(receiver_position) <= 120),
 receiver_agreed boolean NOT NULL CHECK (receiver_agreed),
 file_size integer NOT NULL CHECK (file_size > 0 AND file_size <= 5242880),
 taken_by uuid NOT NULL,
 taken_at timestamptz NOT NULL DEFAULT now(),
 hidden_at timestamptz,
 hidden_by uuid,
 hidden_reason text CHECK (hidden_reason IS NULL OR length(hidden_reason) <= 300)
);
CREATE INDEX IF NOT EXISTS proof_photos_transmittal_idx
 ON public.proof_photos(kind, transmittal_id) WHERE hidden_at IS NULL;
ALTER TABLE public.proof_photos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.proof_photos FROM anon, authenticated;

CREATE FUNCTION public.i_track_add_proof_photo(p_kind text, p_transmittal uuid, p_file_path text,
 p_receiver_name text, p_receiver_position text, p_receiver_agreed boolean, p_file_size integer)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare
 v_id uuid;
 v_name text := btrim(coalesce(p_receiver_name, ''));
 v_position text := nullif(btrim(coalesce(p_receiver_position, '')), '');
 v_size bigint;
 v_number text;
begin
 if p_kind is null or p_kind not in ('division', 'district') then
  raise exception 'Unknown transmittal kind';
 end if;
 if not coalesce(private.i_track_can_add_proof(p_kind, p_transmittal), false) then
  raise exception 'Only the person who prepared or brings this transmittal can add a proof photo';
 end if;
 if p_receiver_agreed is not true then
  raise exception 'Ask the receiver first, then tick that they agreed to be in the photo';
 end if;
 if length(v_name) < 2 or length(v_name) > 120 then
  raise exception 'Type the name of the person who received the documents';
 end if;
 if v_position is not null and length(v_position) > 120 then
  raise exception 'Position or office is too long (120 characters at most)';
 end if;
 if p_file_path is null or split_part(p_file_path, '/', 1) <> p_kind
   or split_part(p_file_path, '/', 2) <> p_transmittal::text
   or not coalesce(private.i_track_proof_path_allowed(p_file_path, true), false) then
  raise exception 'The photo does not belong to this transmittal';
 end if;
 select coalesce((o.metadata->>'size')::bigint, p_file_size) into v_size
 from storage.objects o
 where o.bucket_id = 'proof-photos' and o.name = p_file_path
  and (o.owner = auth.uid() or o.owner_id = auth.uid()::text);
 if not found then
  raise exception 'The photo upload was not found. Please try again.';
 end if;
 if (select count(*) from public.proof_photos p
     where p.kind = p_kind and p.transmittal_id = p_transmittal and p.hidden_at is null) >= 10 then
  raise exception 'This transmittal already has 10 proof photos';
 end if;
 insert into public.proof_photos(kind, transmittal_id, file_path, receiver_name, receiver_position,
  receiver_agreed, file_size, taken_by)
 values (p_kind, p_transmittal, p_file_path, v_name, v_position, true, v_size, auth.uid())
 returning id into v_id;
 if p_kind = 'division' then
  select t.transmittal_number into v_number from public.division_transmittals t where t.id = p_transmittal;
 else
  select t.transmittal_number into v_number from public.district_transmittals t where t.id = p_transmittal;
 end if;
 insert into public.audit_log(actor_user_id, action, entity_type, entity_id, details)
 values (auth.uid(), 'proof_photo_added', p_kind || '_transmittal', p_transmittal,
  jsonb_build_object('photo_id', v_id, 'transmittal_number', v_number, 'receiver_name', v_name));
 return v_id;
end
$function$;

CREATE FUNCTION public.i_track_proof_photos(p_kind text, p_transmittal uuid)
RETURNS TABLE(id uuid, file_path text, receiver_name text, receiver_position text,
 taken_by_name text, taken_at timestamptz, mine boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 SELECT p.id, p.file_path, p.receiver_name, p.receiver_position,
  coalesce(nullif(pr.display_name, ''), 'i-TRACK user'), p.taken_at,
  p.taken_by = (SELECT auth.uid())
 FROM public.proof_photos p
 LEFT JOIN public.profiles pr ON pr.id = p.taken_by
 WHERE p.kind = p_kind AND p.transmittal_id = p_transmittal AND p.hidden_at IS NULL
  AND coalesce((SELECT private.i_track_can_see_proof(p_kind, p_transmittal)), false)
 ORDER BY p.taken_at DESC
$function$;

CREATE FUNCTION public.i_track_document_proof_photos(p_document uuid)
RETURNS TABLE(id uuid, kind text, transmittal_number text, file_path text, receiver_name text,
 receiver_position text, taken_by_name text, taken_at timestamptz, mine boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 WITH links AS (
  SELECT DISTINCT 'division'::text AS kind, t.id, t.transmittal_number
  FROM public.division_transmittal_items i
  JOIN public.division_transmittals t ON t.id = i.transmittal_id
  WHERE i.document_id = p_document
  UNION
  SELECT DISTINCT 'district'::text, t.id, t.transmittal_number
  FROM public.district_transmittal_items i
  JOIN public.district_transmittals t ON t.id = i.transmittal_id
  WHERE i.document_id = p_document
 )
 SELECT p.id, p.kind, l.transmittal_number, p.file_path, p.receiver_name, p.receiver_position,
  coalesce(nullif(pr.display_name, ''), 'i-TRACK user'), p.taken_at,
  p.taken_by = (SELECT auth.uid())
 FROM links l
 JOIN public.proof_photos p ON p.kind = l.kind AND p.transmittal_id = l.id AND p.hidden_at IS NULL
 LEFT JOIN public.profiles pr ON pr.id = p.taken_by
 WHERE coalesce((SELECT private.i_track_can_see_proof(l.kind, l.id)), false)
 ORDER BY p.taken_at DESC
$function$;

-- A wrong photo can be removed by the person who took it within 15 minutes,
-- or by a District administrator at any time (with a reason). Removing only
-- hides it; the file and the record are kept.
CREATE FUNCTION public.i_track_hide_proof_photo(p_photo uuid, p_reason text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare
 v public.proof_photos%rowtype;
 v_admin boolean := coalesce((select private.i_track_is_admin()), false);
 v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
 select * into v from public.proof_photos where id = p_photo and hidden_at is null for update;
 if not found then raise exception 'Photo not found'; end if;
 if not (v_admin or (v.taken_by = auth.uid() and v.taken_at > now() - interval '15 minutes')) then
  raise exception 'Only a District administrator can remove this photo now';
 end if;
 if v_admin and v.taken_by <> auth.uid() and v_reason is null then
  raise exception 'Give a short reason for removing the photo';
 end if;
 if v_reason is not null and length(v_reason) > 300 then
  raise exception 'Reason is too long (300 characters at most)';
 end if;
 update public.proof_photos
 set hidden_at = now(), hidden_by = auth.uid(),
  hidden_reason = coalesce(v_reason, 'Removed by the person who took it')
 where id = v.id;
 insert into public.audit_log(actor_user_id, action, entity_type, entity_id, details)
 values (auth.uid(), 'proof_photo_hidden', v.kind || '_transmittal', v.transmittal_id,
  jsonb_build_object('photo_id', v.id, 'reason', coalesce(v_reason, 'Removed by the person who took it')));
 return true;
end
$function$;

REVOKE ALL ON FUNCTION private.i_track_can_see_proof(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.i_track_can_add_proof(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.i_track_proof_path_allowed(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.i_track_can_see_proof(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.i_track_can_add_proof(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.i_track_proof_path_allowed(text, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.i_track_add_proof_photo(text, uuid, text, text, text, boolean, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.i_track_proof_photos(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.i_track_document_proof_photos(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.i_track_hide_proof_photo(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.i_track_add_proof_photo(text, uuid, text, text, text, boolean, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.i_track_proof_photos(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.i_track_document_proof_photos(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.i_track_hide_proof_photo(uuid, text) TO authenticated, service_role;
