-- v65: administrator-entered feedback references for the existing consolidation screen.
-- This is not user-submitted feedback. The referenced personnel are never recorded
-- as senders; original user_feedback records remain separate and unchanged.
CREATE TABLE IF NOT EXISTS public.i_track_admin_feedback_entries (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 referenced_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 entered_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 category text NOT NULL CHECK (category IN ('problem','suggestion')),
 subject text NOT NULL CHECK (char_length(btrim(subject)) BETWEEN 3 AND 180),
 message text NOT NULL CHECK (char_length(btrim(message)) BETWEEN 10 AND 4000),
 status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','reviewing','resolved')),
 admin_response text CHECK (char_length(coalesce(admin_response,'')) <= 2000),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.i_track_admin_feedback_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.i_track_admin_feedback_entries FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.i_track_admin_feedback_entries TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.i_track_admin_feedback_entries_id_seq TO authenticated;
DROP POLICY IF EXISTS i_track_admin_feedback_access ON public.i_track_admin_feedback_entries;
CREATE POLICY i_track_admin_feedback_access ON public.i_track_admin_feedback_entries
 FOR ALL TO authenticated
 USING ((SELECT private.i_track_is_admin()))
 WITH CHECK ((SELECT private.i_track_is_admin()) AND entered_by IS NOT NULL);
COMMENT ON TABLE public.i_track_admin_feedback_entries IS
 'Administrator-authored illustrative feedback references; not submissions attributed to the referenced users.';
-- Six initial entries were inserted separately through a verified, one-time
-- administrator data operation on 2026-11-01. Do not regenerate test entries
-- automatically during database migration or user signup.
