-- v93: administrators can archive an announcement, or remove one nobody used.
-- Nothing is erased. Records, files in Google Drive and history all stay:
--   * no file and no submission record   -> kind 'removed' (shown as "Deleted")
--   * files or submission records exist  -> kind 'archived'
-- Either way the announcement leaves every list, its status becomes closed
-- (so uploads stop), and an administrator can restore it from the Archive page.
-- Additive or one-line changes only; no existing row is modified here.

ALTER TABLE public.announcements
 ADD COLUMN IF NOT EXISTS archived_at timestamptz,
 ADD COLUMN IF NOT EXISTS archived_by uuid,
 ADD COLUMN IF NOT EXISTS archive_kind text,
 ADD COLUMN IF NOT EXISTS archive_reason text,
 ADD COLUMN IF NOT EXISTS status_before_archive text;
ALTER TABLE public.announcements
 ADD CONSTRAINT announcements_archive_kind_check CHECK (archive_kind IS NULL OR archive_kind IN ('archived', 'removed')),
 ADD CONSTRAINT announcements_archive_consistent CHECK ((archived_at IS NULL) = (archive_kind IS NULL));
GRANT SELECT (archived_at, archived_by, archive_kind, archive_reason) ON public.announcements TO authenticated;

-- Schools and the OIC-PSDS no longer see archived announcements; administrators still do.
ALTER POLICY announcements_visible_to_assigned_users ON public.announcements
 USING (
  (SELECT private.i_track_is_admin())
  OR ((SELECT private.i_track_is_oic_psds())
      AND status = ANY (ARRAY['open'::text, 'closed'::text])
      AND archived_at IS NULL)
  OR ((SELECT private.i_track_is_active())
      AND status = ANY (ARRAY['open'::text, 'closed'::text])
      AND archived_at IS NULL
      AND EXISTS (SELECT 1 FROM public.announcement_assignments aa
                  WHERE aa.announcement_id = announcements.id
                    AND aa.obligation_status = 'required'::text
                    AND (aa.school_id = (SELECT private.i_track_my_school_id())
                         OR aa.assigned_user_id = (SELECT auth.uid()))))
 );

-- The three lists below gain one condition each: skip archived announcements
-- (verification inbox, District Reports, Division eligible submissions).
CREATE OR REPLACE FUNCTION public.i_track_compliance_list(p_announcement uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(jsonb_build_object(
 'id',c.id,'assignment_id',c.assignment_id,'announcement_id',aa.announcement_id,
 'number',c.compliance_number,'school_id',c.school_id,'school_name',coalesce(s.name,'School'),
 'announcement_title',a.title,'status',c.status,'submitted_at',c.submitted_at,
 'submitted_by_name',coalesce(p.display_name,'Authorized user'),'verified_at',c.verified_at,
 'return_reason',c.return_reason,'has_attachment',c.current_submission_id is not null,
 'current_submission_id',c.current_submission_id) order by c.submitted_at desc),'[]'::jsonb)
 from public.announcement_compliances c
 join public.announcement_assignments aa on aa.id=c.assignment_id
 join public.announcements a on a.id=aa.announcement_id
 left join public.schools s on s.id=c.school_id
 left join public.profiles p on p.id=c.submitted_by
 where (p_announcement is null or aa.announcement_id=p_announcement)
 and a.archived_at is null
 and exists(select 1 from public.profiles viewer where viewer.id=auth.uid() and viewer.account_status='active' and
 (viewer.role in ('main_admin','backup_admin') or (viewer.school_id is not null and viewer.school_id=c.school_id) or viewer.id=c.submitted_by
  or exists(select 1 from public.announcement_approvers ap where ap.announcement_id=aa.announcement_id and ap.user_id=auth.uid())))
 $function$;

CREATE OR REPLACE FUNCTION public.i_track_district_report()
 RETURNS TABLE(announcement_id uuid, announcement_code text, title text, deadline_at timestamp with time zone, required_schools bigint, submitted_count bigint, late_count bigint, pending_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH received AS (
    SELECT a.id AS ann_id,a.announcement_code,a.title,a.deadline_at,
      aa.id AS assignment_id,
      (SELECT min(sub.first_received_at)
       FROM public.submissions sub
       WHERE sub.assignment_id=aa.id AND sub.storage_status IN ('uploaded','archived')) AS first_received_at
    FROM public.announcements a
    JOIN public.announcement_assignments aa ON aa.announcement_id=a.id
      AND aa.obligation_status='required' AND aa.school_id IS NOT NULL
    WHERE a.status IN ('open','closed') AND a.archived_at IS NULL
      AND ((SELECT private.i_track_is_admin()) OR (SELECT private.i_track_is_oic_psds()))
  )
  SELECT r.ann_id,r.announcement_code,r.title,r.deadline_at,
    count(*)::bigint,
    count(*) FILTER (WHERE r.first_received_at IS NOT NULL
      AND r.first_received_at<=r.deadline_at)::bigint,
    count(*) FILTER (WHERE r.first_received_at>r.deadline_at)::bigint,
    count(*) FILTER (WHERE r.first_received_at IS NULL)::bigint
  FROM received r
  GROUP BY r.ann_id,r.announcement_code,r.title,r.deadline_at
  ORDER BY r.deadline_at DESC,r.announcement_code;
 $function$;

CREATE OR REPLACE FUNCTION public.i_track_division_list()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object(
 'transmittals',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.division_transmittals t where exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status='active' and p.role<>'oic_psds') and
 (t.prepared_by=auth.uid() or t.assigned_submitter=auth.uid() or private.i_track_is_admin() or exists(select 1 from public.division_transmittal_items i where i.transmittal_id=t.id and (private.i_track_can_view_document(i.document_id) or exists(select 1 from public.announcement_compliances c join public.profiles p on p.id=auth.uid() where c.id=i.compliance_id and (c.submitted_by=p.id or c.school_id=p.school_id)))))),'[]'::jsonb),
 'items',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('admin_removed',source_doc.admin_removed_at is not null,'rightful_owner_id',coalesce(i.rightful_owner_id,source_doc.created_by,source_compliance.submitted_by),'rightful_owner_name',coalesce(rightful_profile.display_name,'Original sender'),'rightful_owner_school',coalesce(rightful_school.name,'District Office'),'effective_return_required',coalesce(i.return_required_override,(select dd.return_required from public.documents dd where dd.id=i.document_id),true),
'ao_sender_name',coalesce(actual_ao.display_name,origin_ao.display_name,assigned_ao.display_name,'Not recorded'),
'ao_sender_position',coalesce(actual_ao.position_title,origin_ao.position_title,assigned_ao.position_title,''),
'ao_sender_is_submitted',i.submitted_by IS NOT NULL) order by i.tracking_number) from public.division_transmittal_items i join public.division_transmittals t on t.id=i.transmittal_id
 left join public.documents source_doc on source_doc.id=i.document_id
 left join public.announcement_compliances source_compliance on source_compliance.id=i.compliance_id
 left join public.profiles rightful_profile on rightful_profile.id=coalesce(i.rightful_owner_id,source_doc.created_by,source_compliance.submitted_by)
 left join public.schools rightful_school on rightful_school.id=rightful_profile.school_id
 left join public.profiles actual_ao on actual_ao.id=i.submitted_by
 left join public.profiles origin_ao on origin_ao.id=coalesce(source_doc.created_by,source_compliance.submitted_by)
 left join public.profiles assigned_ao on assigned_ao.id=t.assigned_submitter
 where exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status='active' and p.role<>'oic_psds') and
 (private.i_track_is_admin() or t.prepared_by=auth.uid() or t.assigned_submitter=auth.uid() or private.i_track_can_view_document(i.document_id) or exists(select 1 from public.announcement_compliances c join public.profiles p on p.id=auth.uid() where c.id=i.compliance_id and (c.submitted_by=p.id or c.school_id=p.school_id)))),'[]'::jsonb),
 'eligible',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'subject',d.subject,'tracking_number',d.tracking_number,'document_type',d.document_type,'school_id',d.origin_school_id,'default_owner_id',d.created_by)) from public.documents d where d.destination='division' and d.status<>'completed' and d.admin_removed_at is null and not exists(select 1 from public.division_transmittal_items i where i.document_id=d.id and i.division_status not in ('received_by_sender','not_for_return','cancelled','lost')) limit 200),'[]'::jsonb),
 'eligible_compliances',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'tracking_number',c.compliance_number,'subject',a.title,'school_id',c.school_id,'school_name',s.name,'document_type','Announcement Submission','default_owner_id',c.submitted_by)) from public.announcement_compliances c join public.announcement_assignments aa on aa.id=c.assignment_id join public.announcements a on a.id=aa.announcement_id left join public.schools s on s.id=c.school_id where c.status='verified' and a.status<>'cancelled' and a.archived_at is null and not exists(select 1 from public.division_transmittal_items i where i.compliance_id=c.id and i.division_status not in ('received_by_sender','not_for_return','cancelled','lost')) limit 200),'[]'::jsonb),
 'people',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'position',p.position_title,'school_name',coalesce(s.name,'District Office'))) from public.profiles p join auth.users au on au.id=p.id left join public.schools s on s.id=p.school_id where p.account_status='active' and p.role<>'oic_psds' and au.email_confirmed_at is not null),'[]'::jsonb)
 ) from public.profiles viewer where viewer.id=auth.uid() and viewer.account_status='active' and viewer.role<>'oic_psds'
$function$;


-- Activity per announcement, so the board offers Delete or Archive (administrators only).
CREATE FUNCTION public.i_track_announcement_activity()
RETURNS TABLE(announcement_id uuid, files bigint, records bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 SELECT a.id,
  (SELECT count(*) FROM public.submissions s
     JOIN public.announcement_assignments aa ON aa.id = s.assignment_id
    WHERE aa.announcement_id = a.id),
  (SELECT count(*) FROM public.announcement_compliances c
     JOIN public.announcement_assignments aa ON aa.id = c.assignment_id
    WHERE aa.announcement_id = a.id)
 FROM public.announcements a
 WHERE (SELECT private.i_track_is_admin())
$function$;

CREATE FUNCTION public.i_track_archive_announcement(p_announcement uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare
 a public.announcements%rowtype;
 v_files bigint;
 v_records bigint;
 v_kind text;
 v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
 if not (select private.i_track_is_admin()) then
  raise exception 'District administrator required';
 end if;
 if v_reason is not null and length(v_reason) > 500 then
  raise exception 'Reason is too long (500 characters at most)';
 end if;
 select * into a from public.announcements where id = p_announcement for update;
 if not found then raise exception 'Announcement not found'; end if;
 if a.archived_at is not null then raise exception 'This announcement is already archived'; end if;
 select count(*) into v_files from public.submissions s
   join public.announcement_assignments aa on aa.id = s.assignment_id
  where aa.announcement_id = a.id;
 select count(*) into v_records from public.announcement_compliances c
   join public.announcement_assignments aa on aa.id = c.assignment_id
  where aa.announcement_id = a.id;
 v_kind := case when v_files = 0 and v_records = 0 then 'removed' else 'archived' end;
 update public.announcements set
  status_before_archive = a.status,
  status = case when a.status = 'cancelled' then 'cancelled' else 'closed' end,
  archived_at = now(),
  archived_by = auth.uid(),
  archive_kind = v_kind,
  archive_reason = v_reason,
  updated_at = now()
 where id = a.id;
 insert into public.audit_log(actor_user_id, action, entity_type, entity_id, details)
 values (auth.uid(), 'announcement_' || v_kind, 'announcement', a.id,
  jsonb_build_object('files', v_files, 'records', v_records, 'previous_status', a.status,
   'code', a.announcement_code, 'reason', v_reason));
 return jsonb_build_object('kind', v_kind, 'files', v_files, 'records', v_records);
end
$function$;

CREATE FUNCTION public.i_track_restore_announcement(p_announcement uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare
 a public.announcements%rowtype;
 v_status text;
begin
 if not (select private.i_track_is_admin()) then
  raise exception 'District administrator required';
 end if;
 select * into a from public.announcements where id = p_announcement for update;
 if not found then raise exception 'Announcement not found'; end if;
 if a.archived_at is null then raise exception 'This announcement is not archived'; end if;
 v_status := coalesce(a.status_before_archive, a.status);
 update public.announcements set
  status = v_status,
  archived_at = null, archived_by = null, archive_kind = null,
  archive_reason = null, status_before_archive = null,
  updated_at = now()
 where id = a.id;
 insert into public.audit_log(actor_user_id, action, entity_type, entity_id, details)
 values (auth.uid(), 'announcement_restored', 'announcement', a.id,
  jsonb_build_object('was', a.archive_kind, 'restored_status', v_status, 'code', a.announcement_code));
 return jsonb_build_object('status', v_status);
end
$function$;

CREATE FUNCTION public.i_track_archived_announcements()
RETURNS TABLE(id uuid, announcement_code text, title text, archive_kind text,
 archived_at timestamptz, archived_by_name text, archive_reason text,
 previous_status text, deadline_at timestamptz, files bigint, records bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 SELECT a.id, a.announcement_code, a.title, a.archive_kind, a.archived_at,
  coalesce(nullif(p.display_name, ''), 'District administrator'), a.archive_reason,
  a.status_before_archive, a.deadline_at,
  (SELECT count(*) FROM public.submissions s
     JOIN public.announcement_assignments aa ON aa.id = s.assignment_id
    WHERE aa.announcement_id = a.id),
  (SELECT count(*) FROM public.announcement_compliances c
     JOIN public.announcement_assignments aa ON aa.id = c.assignment_id
    WHERE aa.announcement_id = a.id)
 FROM public.announcements a
 LEFT JOIN public.profiles p ON p.id = a.archived_by
 WHERE a.archived_at IS NOT NULL AND (SELECT private.i_track_is_admin())
 ORDER BY a.archived_at DESC
$function$;

REVOKE ALL ON FUNCTION public.i_track_announcement_activity() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.i_track_archive_announcement(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.i_track_restore_announcement(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.i_track_archived_announcements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.i_track_announcement_activity() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.i_track_archive_announcement(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.i_track_restore_announcement(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.i_track_archived_announcements() TO authenticated, service_role;
