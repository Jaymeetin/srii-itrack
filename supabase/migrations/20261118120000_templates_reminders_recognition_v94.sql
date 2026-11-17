-- v94: templates library, reminders to schools, on-time recognition.
-- Additive only. No existing row is changed.

-------------------------------------------------------------------------
-- 1. Templates: blank forms any signed-in user can download.
--    District administrators upload them. Files live in Supabase Storage
--    (bucket "templates"); removing one only hides it, the file is kept.
-------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 title text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 150),
 description text CHECK (description IS NULL OR length(description) <= 1000),
 file_path text NOT NULL UNIQUE CHECK (length(file_path) BETWEEN 5 AND 300),
 file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 180),
 content_type text NOT NULL,
 file_size bigint NOT NULL CHECK (file_size > 0 AND file_size <= 31457280),
 announcement_id uuid REFERENCES public.announcements(id),
 uploaded_by uuid NOT NULL DEFAULT auth.uid(),
 uploaded_at timestamptz NOT NULL DEFAULT now(),
 removed_at timestamptz,
 removed_by uuid
);
CREATE INDEX IF NOT EXISTS templates_announcement_idx ON public.templates(announcement_id) WHERE removed_at IS NULL;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY templates_read_by_active_users ON public.templates
 FOR SELECT TO authenticated
 USING (removed_at IS NULL AND (SELECT private.i_track_is_active()));
CREATE POLICY templates_added_by_admins ON public.templates
 FOR INSERT TO authenticated
 WITH CHECK ((SELECT private.i_track_is_admin())
  AND uploaded_by = (SELECT auth.uid())
  AND removed_at IS NULL AND removed_by IS NULL);
REVOKE ALL ON public.templates FROM anon, authenticated;
GRANT SELECT, INSERT ON public.templates TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('templates', 'templates', false, 31457280, ARRAY[
 'application/pdf',
 'application/msword',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.ms-excel',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'application/vnd.ms-powerpoint',
 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;
CREATE POLICY itrack_templates_files_read ON storage.objects
 FOR SELECT TO authenticated
 USING (bucket_id = 'templates' AND (SELECT private.i_track_is_active()));
CREATE POLICY itrack_templates_files_added_by_admins ON storage.objects
 FOR INSERT TO authenticated
 WITH CHECK (bucket_id = 'templates' AND (SELECT private.i_track_is_admin()));

CREATE FUNCTION public.i_track_remove_template(p_template uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare t public.templates%rowtype;
begin
 if not (select private.i_track_is_admin()) then
  raise exception 'District administrator required';
 end if;
 select * into t from public.templates where id = p_template and removed_at is null for update;
 if not found then raise exception 'Template not found'; end if;
 update public.templates set removed_at = now(), removed_by = auth.uid() where id = t.id;
 insert into public.audit_log(actor_user_id, action, entity_type, entity_id, details)
 values (auth.uid(), 'template_removed', 'template', t.id,
  jsonb_build_object('title', t.title, 'file_name', t.file_name));
 return true;
end
$function$;

-------------------------------------------------------------------------
-- 2. Reminders: an administrator or the OIC-PSDS nudges every school that
--    has not sent anything (or was returned for correction). A school sees
--    the reminder until it submits. At most one per school every 12 hours.
-------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.announcement_reminders (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 announcement_id uuid NOT NULL REFERENCES public.announcements(id),
 assignment_id uuid NOT NULL REFERENCES public.announcement_assignments(id),
 school_id uuid,
 message text CHECK (message IS NULL OR length(message) <= 300),
 sent_by uuid NOT NULL,
 sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS announcement_reminders_assignment_idx
 ON public.announcement_reminders(assignment_id, sent_at DESC);
ALTER TABLE public.announcement_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.announcement_reminders FROM anon, authenticated;

CREATE FUNCTION public.i_track_send_reminders(p_announcement uuid, p_message text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare
 a public.announcements%rowtype;
 v_message text := nullif(btrim(coalesce(p_message, '')), '');
 v_pending integer;
 v_sent integer;
begin
 if not ((select private.i_track_is_admin()) or (select private.i_track_is_oic_psds())) then
  raise exception 'District administrator or OIC-PSDS required';
 end if;
 if v_message is not null and length(v_message) > 300 then
  raise exception 'Message is too long (300 characters at most)';
 end if;
 select * into a from public.announcements where id = p_announcement;
 if not found or a.archived_at is not null then raise exception 'Announcement not found'; end if;
 if a.status <> 'open' then raise exception 'Reminders can only be sent for open announcements'; end if;

 select count(*) into v_pending
 from public.announcement_assignments aa
 left join public.announcement_compliances c on c.assignment_id = aa.id
 where aa.announcement_id = a.id and aa.obligation_status = 'required' and aa.school_id is not null
  and (c.id is null or c.status = 'returned');

 with fresh as (
  select aa.id as assignment_id, aa.school_id
  from public.announcement_assignments aa
  left join public.announcement_compliances c on c.assignment_id = aa.id
  where aa.announcement_id = a.id and aa.obligation_status = 'required' and aa.school_id is not null
   and (c.id is null or c.status = 'returned')
   and not exists (select 1 from public.announcement_reminders r
                   where r.assignment_id = aa.id and r.sent_at > now() - interval '12 hours')
 ), added as (
  insert into public.announcement_reminders(announcement_id, assignment_id, school_id, message, sent_by)
  select a.id, f.assignment_id, f.school_id, v_message, auth.uid() from fresh f
  returning 1
 )
 select count(*) into v_sent from added;

 insert into public.audit_log(actor_user_id, action, entity_type, entity_id, details)
 values (auth.uid(), 'reminders_sent', 'announcement', a.id,
  jsonb_build_object('sent', v_sent, 'pending', v_pending, 'code', a.announcement_code));
 return jsonb_build_object('sent', v_sent, 'pending', v_pending, 'recently_reminded', v_pending - v_sent);
end
$function$;

CREATE FUNCTION public.i_track_my_reminders()
RETURNS TABLE(announcement_id uuid, assignment_id uuid, announcement_code text, title text,
 deadline_at timestamptz, sent_at timestamptz, sender_name text, message text, returned boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 SELECT DISTINCT ON (aa.id)
  a.id, aa.id, a.announcement_code, a.title, a.deadline_at, r.sent_at,
  coalesce(nullif(p.display_name, ''), 'District Office'), r.message, c.status = 'returned'
 FROM public.announcement_reminders r
 JOIN public.announcement_assignments aa ON aa.id = r.assignment_id
 JOIN public.announcements a ON a.id = aa.announcement_id
 LEFT JOIN public.profiles p ON p.id = r.sent_by
 LEFT JOIN public.announcement_compliances c ON c.assignment_id = aa.id
 WHERE a.status = 'open' AND a.archived_at IS NULL
  AND (c.id IS NULL OR c.status = 'returned')
  AND r.sent_at > now() - interval '14 days'
  AND EXISTS (SELECT 1 FROM public.profiles me
              WHERE me.id = auth.uid() AND me.account_status = 'active'
               AND (aa.school_id = me.school_id OR aa.assigned_user_id = me.id))
 ORDER BY aa.id, r.sent_at DESC
$function$;

CREATE FUNCTION public.i_track_last_reminders(p_announcement uuid)
RETURNS TABLE(school_id uuid, sent_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 SELECT r.school_id, max(r.sent_at)
 FROM public.announcement_reminders r
 WHERE r.announcement_id = p_announcement
  AND ((SELECT private.i_track_is_admin()) OR (SELECT private.i_track_is_oic_psds()))
 GROUP BY r.school_id
$function$;

-------------------------------------------------------------------------
-- 3. On-time recognition: per school, requirements due in the last N days
--    and how many were received by the deadline (same rule as District
--    Reports: the first securely received file counts).
-------------------------------------------------------------------------
CREATE FUNCTION public.i_track_on_time_schools(p_days integer DEFAULT 30)
RETURNS TABLE(school_id uuid, school_name text, due bigint, on_time bigint, late bigint, missing bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 WITH due AS (
  SELECT aa.school_id, a.deadline_at,
   (SELECT min(sub.first_received_at) FROM public.submissions sub
     WHERE sub.assignment_id = aa.id AND sub.storage_status IN ('uploaded', 'archived')) AS first_received_at
  FROM public.announcements a
  JOIN public.announcement_assignments aa ON aa.announcement_id = a.id
   AND aa.obligation_status = 'required' AND aa.school_id IS NOT NULL
  WHERE a.status IN ('open', 'closed') AND a.archived_at IS NULL
   AND a.deadline_at <= now()
   AND a.deadline_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 366)))
   AND ((SELECT private.i_track_is_admin()) OR (SELECT private.i_track_is_oic_psds()))
 )
 SELECT s.id, s.name, count(*),
  count(*) FILTER (WHERE d.first_received_at IS NOT NULL AND d.first_received_at <= d.deadline_at),
  count(*) FILTER (WHERE d.first_received_at > d.deadline_at),
  count(*) FILTER (WHERE d.first_received_at IS NULL)
 FROM due d JOIN public.schools s ON s.id = d.school_id
 GROUP BY s.id, s.name
 ORDER BY 4 DESC, s.name
$function$;

REVOKE ALL ON FUNCTION public.i_track_remove_template(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.i_track_send_reminders(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.i_track_my_reminders() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.i_track_last_reminders(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.i_track_on_time_schools(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.i_track_remove_template(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.i_track_send_reminders(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.i_track_my_reminders() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.i_track_last_reminders(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.i_track_on_time_schools(integer) TO authenticated, service_role;
