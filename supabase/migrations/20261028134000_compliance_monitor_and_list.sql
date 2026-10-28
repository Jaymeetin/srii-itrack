CREATE OR REPLACE FUNCTION public.i_track_division_list()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object(
 'transmittals',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.division_transmittals t where exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status='active' and p.role<>'oic_psds') and
 (t.prepared_by=auth.uid() or t.assigned_submitter=auth.uid() or private.i_track_is_admin() or exists(select 1 from public.division_transmittal_items i where i.transmittal_id=t.id and (private.i_track_can_view_document(i.document_id) or exists(select 1 from public.announcement_compliances c join public.profiles p on p.id=auth.uid() where c.id=i.compliance_id and (c.submitted_by=p.id or c.school_id=p.school_id)))))),'[]'::jsonb),
 'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.tracking_number) from public.division_transmittal_items i join public.division_transmittals t on t.id=i.transmittal_id where exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status='active' and p.role<>'oic_psds') and
 (private.i_track_is_admin() or t.prepared_by=auth.uid() or t.assigned_submitter=auth.uid() or private.i_track_can_view_document(i.document_id) or exists(select 1 from public.announcement_compliances c join public.profiles p on p.id=auth.uid() where c.id=i.compliance_id and (c.submitted_by=p.id or c.school_id=p.school_id)))),'[]'::jsonb),
 'eligible',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'subject',d.subject,'tracking_number',d.tracking_number,'document_type',d.document_type,'school_id',d.origin_school_id)) from public.documents d where d.destination='division' and d.status<>'completed' and not exists(select 1 from public.division_transmittal_items i where i.document_id=d.id and i.division_status not in ('received_by_sender','not_for_return','cancelled','lost')) limit 200),'[]'::jsonb),
 'eligible_compliances',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'tracking_number',c.compliance_number,'subject',a.title,'school_id',c.school_id,'school_name',s.name,'document_type','Announcement Submission')) from public.announcement_compliances c join public.announcement_assignments aa on aa.id=c.assignment_id join public.announcements a on a.id=aa.announcement_id left join public.schools s on s.id=c.school_id where c.status='verified' and not exists(select 1 from public.division_transmittal_items i where i.compliance_id=c.id and i.division_status not in ('received_by_sender','not_for_return','cancelled','lost')) limit 200),'[]'::jsonb),
 'people',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'position',p.position_title,'school_name',coalesce(s.name,'District Office'))) from public.profiles p join auth.users au on au.id=p.id left join public.schools s on s.id=p.school_id where p.account_status='active' and p.role<>'oic_psds' and au.email_confirmed_at is not null),'[]'::jsonb)
 ) from public.profiles viewer where viewer.id=auth.uid() and viewer.account_status='active' and viewer.role<>'oic_psds'
$function$
;

CREATE OR REPLACE FUNCTION public.i_track_monitor(p_announcement_id uuid)
 RETURNS TABLE(school_name text, submission_status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH viewer AS (
    SELECT p.role,p.school_id
    FROM public.profiles p
    WHERE p.id=auth.uid() AND p.account_status='active'
  )
  SELECT s.name,
    CASE WHEN c.id IS NULL THEN 'Pending'
         WHEN c.status='returned' THEN 'Returned for Correction'
         WHEN c.status='pending_verification' THEN 'Pending Verification'
         WHEN c.submitted_at > a.deadline_at THEN 'Late'
         ELSE 'Submitted' END::text
  FROM public.announcements a
  JOIN public.announcement_assignments aa
    ON aa.announcement_id=a.id AND aa.obligation_status='required'
   AND aa.school_id IS NOT NULL
  JOIN public.schools s ON s.id=aa.school_id
  LEFT JOIN public.announcement_compliances c ON c.assignment_id=aa.id
  WHERE a.id=p_announcement_id
    AND a.status IN ('open','closed')
    AND EXISTS (
      SELECT 1 FROM viewer v
      WHERE v.role IN ('main_admin','backup_admin','oic_psds')
         OR EXISTS (
          SELECT 1 FROM public.announcement_assignments mine
          WHERE mine.announcement_id=a.id
           AND mine.obligation_status='required'
           AND (mine.school_id=v.school_id OR mine.assigned_user_id=auth.uid())
        )
    )
  ORDER BY s.name;
 $function$
;