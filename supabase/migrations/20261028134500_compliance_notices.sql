CREATE OR REPLACE FUNCTION private.i_track_compliance_status_notice()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if old.status is distinct from new.status and new.status in ('verified','returned') and new.submitted_by is not null then
  insert into public.division_notifications(recipient_id,message)
  values(new.submitted_by,case when new.status='verified' then 'School submission verified: ' else 'School submission returned: ' end||new.compliance_number);
 end if;
 return new;
end $function$
;
create trigger compliance_status_notifier after update of status on public.announcement_compliances for each row execute function private.i_track_compliance_status_notice();