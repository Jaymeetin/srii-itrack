CREATE OR REPLACE FUNCTION public.i_track_division_action(p_action text, p_transmittal uuid DEFAULT NULL::uuid, p_item uuid DEFAULT NULL::uuid, p_documents uuid[] DEFAULT NULL::uuid[], p_submitter uuid DEFAULT NULL::uuid, p_recipient uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text, p_actual_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid(); admin boolean; t public.division_transmittals%rowtype; i public.division_transmittal_items%rowtype; d public.documents%rowtype; v uuid; newid uuid; newnumber text; oldstatus text; nextstatus text; target uuid;
begin
 if u is null or not exists(select 1 from public.profiles where id=u and account_status='active' and role<>'oic_psds') then raise exception 'Active authorized account required';end if;
 select role in ('main_admin','backup_admin') into admin from public.profiles where id=u;
 if p_action='create' then
  if p_documents is null or array_length(p_documents,1) is null or array_length(p_documents,1)>100 then raise exception 'Choose 1 to 100 documents';end if;
  if p_submitter is null or not exists(select 1 from public.profiles where id=p_submitter and account_status='active' and role<>'oic_psds') then raise exception 'Invalid submitter';end if;
  if (select count(distinct x) from unnest(p_documents) x)<>array_length(p_documents,1) then raise exception 'Duplicate document';end if;
  foreach v in array p_documents loop
   select * into d from public.documents where id=v for update;
   if not found or d.destination<>'division' then raise exception 'Only Division-destination documents may be added';end if;
   if d.status='completed' then raise exception 'Completed document cannot be added to a new transmittal';end if;
   if exists(select 1 from public.division_transmittal_items where document_id=v and division_status not in ('received_by_sender','not_for_return','cancelled','lost')) then raise exception 'Document already in an active transmittal';end if;
  end loop;
  newnumber:='SRII-TR-'||to_char(now() at time zone 'Asia/Manila','YYYY')||'-'||lpad(nextval('public.division_transmittal_sequence')::text,6,'0');
  insert into public.division_transmittals(transmittal_number,prepared_by,assigned_submitter,status) values(newnumber,u,p_submitter,'draft') returning id into newid;
  foreach v in array p_documents loop
   select * into d from public.documents where id=v;
   insert into public.division_transmittal_items(transmittal_id,document_id,school_id,document_label,tracking_number,cycle_number,document_type)
   values(newid,v,d.origin_school_id,d.subject,d.tracking_number,(select coalesce(max(cycle_number),0)+1 from public.division_transmittal_items where document_id=v),d.document_type);
  end loop;
  insert into public.division_transmittal_events(transmittal_id,actor_id,event_type,details) values(newid,u,'created',jsonb_build_object('submitter',p_submitter));
  return jsonb_build_object('id',newid,'number',newnumber);
 end if;
 if p_transmittal is null then raise exception 'Transmittal required';end if;
 select * into t from public.division_transmittals where id=p_transmittal for update;
 if not found then raise exception 'Transmittal not found';end if;
 if p_action='reassign' then
  if t.prepared_by<>u then raise exception 'Only preparer may reassign';end if;
  if t.dispatched_at is not null or t.status<>'draft' then raise exception 'Transmittal locked after first Division submission';end if;
  if p_submitter is null or not exists(select 1 from public.profiles where id=p_submitter and account_status='active' and role<>'oic_psds') then raise exception 'Invalid submitter';end if;
  update public.division_transmittals set assigned_submitter=p_submitter,assignment_accepted_at=null,assignment_accepted_by=null,updated_at=now() where id=t.id;
 elsif p_action='accept' then
  if t.assigned_submitter<>u then raise exception 'Not assigned submitter';end if;
  if t.assignment_accepted_at is not null then raise exception 'Already accepted';end if;
  update public.division_transmittals set assignment_accepted_at=now(),assignment_accepted_by=u,updated_at=now() where id=t.id;
 else
  if p_item is null then raise exception 'Document item required';end if;
  select * into i from public.division_transmittal_items where id=p_item and transmittal_id=t.id for update;
  if not found then raise exception 'Document not in transmittal';end if;
  oldstatus:=i.division_status;
  if p_action='submit' then
   if t.assigned_submitter<>u or t.assignment_accepted_at is null or oldstatus<>'in_transmittal' then raise exception 'Accepted submitter and pending item required';end if;
   if p_actual_date is null or p_actual_date> (now() at time zone 'Asia/Manila')::date then raise exception 'Enter valid actual delivery date';end if;
   update public.division_transmittal_items set division_status='submitted_to_division',submitted_at=(p_actual_date::timestamp at time zone 'Asia/Manila'),submitted_recorded_at=now(),submitted_by=u where id=i.id;
   update public.division_transmittals set status='dispatched',dispatched_at=coalesce(dispatched_at,now()) where id=t.id;
   nextstatus:='submitted_to_division';
  elsif p_action='retrieve' then
   if oldstatus<>'submitted_to_division' then raise exception 'Not awaiting Division retrieval';end if;
   if (select count(*) from public.division_transmittal_items where transmittal_id=t.id and division_status<>'cancelled')=1 then
    update public.division_transmittal_items
       set division_status='received_by_sender',retrieved_from_division_at=now(),
           retrieved_from_division_by=u,final_received_at=now(),
           final_received_by=u,return_status='returned'
     where id=i.id;
    update public.documents set status='completed',updated_at=now() where id=i.document_id;
    update public.document_routes set status='withdrawn',processed_at=now()
     where document_id=i.document_id and status='awaiting_ack' and processed_at is null;
    nextstatus:='received_by_sender';
   else
    update public.division_transmittal_items set division_status='retrieved_from_division',retrieved_from_division_at=now(),retrieved_from_division_by=u where id=i.id;
    nextstatus:='retrieved_from_division';
   end if;
  elsif p_action='forward' then
   if oldstatus<>'retrieved_from_division' or i.retrieved_from_division_by<>u then raise exception 'Only recorded collector may forward';end if;
   if p_recipient is null or not exists(select 1 from public.profiles where id=p_recipient and account_status='active' and role<>'oic_psds') then raise exception 'Select valid district recipient';end if;
   update public.division_transmittal_items set division_status='forwarded_to_district',district_forwarded_at=now(),district_forwarded_by=u,district_recipient_id=p_recipient where id=i.id;
   nextstatus:='forwarded_to_district';
  elsif p_action='district_ack' then
   if oldstatus<>'forwarded_to_district' or i.district_recipient_id<>u then raise exception 'Only assigned district recipient may acknowledge';end if;
   update public.division_transmittal_items set division_status='received_at_district',district_received_at=now(),district_received_by=u where id=i.id;
   nextstatus:='received_at_district';
  elsif p_action in ('sender_received','admin_received','lost','not_for_return','recovered','correct') then
   select * into d from public.documents where id=i.document_id;
   if p_reason is null or length(btrim(p_reason))=0 then raise exception 'Written reason required';end if;
   if p_action='sender_received' then
    if d.created_by<>u or oldstatus in ('received_by_sender','not_for_return','lost','cancelled') then raise exception 'Only original sender can confirm own received document';end if;
    nextstatus:='received_by_sender';
   elsif not admin then raise exception 'Administrator required';
   elsif p_action='admin_received' then nextstatus:='received_by_sender';
   elsif p_action='lost' then nextstatus:='lost';
   elsif p_action='not_for_return' then nextstatus:='not_for_return';
   elsif p_action='recovered' then
    if oldstatus<>'lost' then raise exception 'Only lost items can be recovered';end if;
    nextstatus:=case when i.district_received_at is not null then 'received_at_district' when i.retrieved_from_division_at is not null then 'retrieved_from_division' when i.submitted_at is not null then 'submitted_to_division' else 'in_transmittal' end;
   else
    if oldstatus not in ('lost','not_for_return','received_by_sender') then raise exception 'Only resolved items can be corrected';end if;
    nextstatus:=case when i.district_received_at is not null then 'received_at_district' when i.retrieved_from_division_at is not null then 'retrieved_from_division' when i.submitted_at is not null then 'submitted_to_division' else 'in_transmittal' end;
   end if;
   if oldstatus=nextstatus then raise exception 'Status unchanged';end if;
   update public.division_transmittal_items set division_status=nextstatus,resolution_reason=p_reason,resolved_by=u,resolved_at=now(),final_received_at=case when nextstatus='received_by_sender' then now() else final_received_at end,final_received_by=case when nextstatus='received_by_sender' then u else final_received_by end,return_status=case when nextstatus in ('received_by_sender','not_for_return') then 'returned' else 'pending' end where id=i.id;
   insert into public.division_document_resolutions(document_id,transmittal_item_id,previous_status,new_status,reason,actor_id) values(i.document_id,i.id,oldstatus,case when p_action='recovered' then 'recovered' when p_action='correct' then 'corrected' when nextstatus='received_by_sender' then 'received' else nextstatus end,p_reason,u);
  else raise exception 'Unknown action';end if;
 end if;
 insert into public.division_transmittal_events(transmittal_id,item_id,actor_id,event_type,details) values(t.id,p_item,u,p_action,jsonb_build_object('from',oldstatus,'to',nextstatus,'reason',p_reason,'recipient',p_recipient,'actual_date',p_actual_date));
 return jsonb_build_object('ok',true,'status',nextstatus);
end $function$
; 