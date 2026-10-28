
-- SRII i-TRACK: additive, history-preserving routing update (2026-10-28)
alter table public.documents add column if not exists destination text not null default 'school';
alter table public.documents drop constraint if exists documents_destination_check;
alter table public.documents add constraint documents_destination_check check(destination in ('school','district','division'));
update public.documents d set destination='division'
 where exists(select 1 from public.division_forward_queue q where q.document_id=d.id);
alter table public.documents drop constraint if exists documents_status_check;
alter table public.documents add constraint documents_status_check
 check(status in ('in_transit','received','returned','completed','in_school'));
alter table public.document_routes drop constraint if exists document_routes_status_check;
alter table public.document_routes add constraint document_routes_status_check check(status in ('awaiting_ack','received','withdrawn'));

create or replace function public.i_track_recipient_directory()
returns table(user_id uuid,display_name text,school_name text)
language sql stable security definer set search_path='' as $func$
 select p.id,coalesce(nullif(btrim(p.display_name),''),'School user'),
        coalesce(s.name,'District Office')
 from public.profiles p
 join auth.users au on au.id=p.id
 left join public.schools s on s.id=p.school_id
 where p.account_status='active'
  and p.role in ('school_user','main_admin','backup_admin')
  and au.email_confirmed_at is not null
  and (select private.i_track_is_operator())
 order by p.display_name;
$func$;


create or replace function public.i_track_create_document(
 p_subject text,p_document_type text,p_recipient_id uuid default null,
 p_destination text default 'school',p_notes text default null
) returns text language plpgsql security definer set search_path='' as $func$
declare u uuid:=auth.uid(); doc_id uuid; route_id uuid; tracking text; origin uuid;
begin
 if not (select private.i_track_is_operator()) then raise exception 'Active approved account required';end if;
 if nullif(btrim(coalesce(p_subject,'')),'') is null then raise exception 'Document title required';end if;
 if p_destination not in ('school','district','division') or p_destination is null then raise exception 'Choose a destination';end if;
 if not exists(select 1 from public.document_types where name=p_document_type and is_active) then raise exception 'Choose an approved document type';end if;
 if p_recipient_id is not null and
    (p_recipient_id=u or not exists(
      select 1 from public.profiles p join auth.users au on au.id=p.id
      where p.id=p_recipient_id and p.account_status='active'
       and p.role in ('school_user','main_admin','backup_admin')
       and au.email_confirmed_at is not null
    )) then raise exception 'Recipient is not verified and approved';end if;
 select school_id into origin from public.profiles where id=u;
 tracking:='SRII-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.i_track_document_number_seq')::text,6,'0');
 insert into public.documents(tracking_number,subject,document_type,notes,origin_school_id,created_by,status,destination)
 values(tracking,btrim(p_subject),p_document_type,p_notes,origin,u,
    case when p_recipient_id is null then 'in_school' else 'in_transit' end,p_destination)
 returning id into doc_id;
 if p_recipient_id is not null then
  insert into public.document_routes(document_id,from_user_id,to_user_id,route_action)
    values(doc_id,u,p_recipient_id,'sent') returning id into route_id;
  insert into public.document_events(document_id,route_id,actor_user_id,event_type)
    values(doc_id,route_id,u,'sent');
 else
  insert into public.document_events(document_id,actor_user_id,event_type)
    values(doc_id,u,'saved_in_school');
 end if;
 if p_destination='division' then
  insert into public.division_forward_queue(document_id,forwarded_by,route_id)
   values(doc_id,u,null)
   on conflict(document_id) do nothing;
 end if;
 return tracking;
end $func$;


create or replace function public.i_track_pending_route_action(
 p_document uuid,p_action text,p_recipient uuid default null
) returns text language plpgsql security definer set search_path='' as $func$
declare u uuid:=auth.uid(); d public.documents%rowtype; r public.document_routes%rowtype; newroute uuid;
begin
 if not (select private.i_track_is_operator()) then raise exception 'Active approved account required';end if;
 select * into d from public.documents where id=p_document for update;
 if not found then raise exception 'Document not found';end if;
 if p_action='forward_saved' then
  if d.created_by<>u or d.status<>'in_school' then raise exception 'Only an owner may forward a document saved In School';end if;
 elsif p_action in ('change','cancel') then
  select * into r from public.document_routes where document_id=d.id order by sent_at desc,id desc limit 1 for update;
  if not found or r.from_user_id<>u or r.status<>'awaiting_ack' or r.acknowledged_at is not null or r.processed_at is not null
   then raise exception 'Only the sender can change or cancel a pending unacknowledged delivery';end if;
 else raise exception 'Unsupported routing action';end if;
 if p_action in ('forward_saved','change') then
  if p_recipient is null or p_recipient=u or not exists(
   select 1 from public.profiles p join auth.users au on au.id=p.id
   where p.id=p_recipient and p.account_status='active'
    and p.role in ('school_user','main_admin','backup_admin') and au.email_confirmed_at is not null
  ) then raise exception 'Choose a verified and approved recipient';end if;
 end if;
 if p_action in ('change','cancel') then
  update public.document_routes set status='withdrawn',processed_at=now() where id=r.id;
  insert into public.document_events(document_id,route_id,actor_user_id,event_type)
   values(d.id,r.id,u,case when p_action='cancel' then 'delivery_cancelled' else 'recipient_changed' end);
 end if;
 if p_action='cancel' then
  update public.documents set status='in_school',updated_at=now() where id=d.id;
 else
  insert into public.document_routes(document_id,from_user_id,to_user_id,route_action)
   values(d.id,u,p_recipient,case when p_action='change' then 'sent' else 'forwarded' end) returning id into newroute;
  insert into public.document_events(document_id,route_id,actor_user_id,event_type)
   values(d.id,newroute,u,case when p_action='change' then 'recipient_reassigned' else 'forwarded' end);
  update public.documents set status='in_transit',updated_at=now() where id=d.id;
 end if;
 return (select tracking_number from public.documents where id=d.id);
end $func$;

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
   if (select count(*) from public.division_transmittal_items where transmittal_id=t.id)=1 then
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
CREATE OR REPLACE FUNCTION public.i_track_division_list()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
select jsonb_build_object(
 'transmittals',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.division_transmittals t where exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status='active' and p.role<>'oic_psds') and (t.prepared_by=auth.uid() or t.assigned_submitter=auth.uid() or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('main_admin','backup_admin')) or exists(select 1 from public.division_transmittal_items i where i.transmittal_id=t.id and private.i_track_can_view_document(i.document_id)))),'[]'::jsonb),
 'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.tracking_number) from public.division_transmittal_items i where exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status='active' and p.role<>'oic_psds') and (private.i_track_can_view_document(i.document_id) or i.retrieved_from_division_by=auth.uid() or i.district_recipient_id=auth.uid() or exists(select 1 from public.division_transmittals t where t.id=i.transmittal_id and (t.prepared_by=auth.uid() or t.assigned_submitter=auth.uid())) or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('main_admin','backup_admin')))),'[]'::jsonb),
 'eligible',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'subject',d.subject,'tracking_number',d.tracking_number,'document_type',d.document_type,'school_id',d.origin_school_id) order by d.created_at desc) from public.documents d where d.destination='division' and d.status<>'completed' and exists(select 1 from public.profiles actor where actor.id=auth.uid() and actor.account_status='active' and actor.role<>'oic_psds') and not exists(select 1 from public.division_transmittal_items i where i.document_id=d.id and i.division_status not in ('received_by_sender','not_for_return','cancelled','lost')) limit 200),'[]'::jsonb),
 'people',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'position',p.position_title)) from public.profiles p where p.account_status='active' and p.role<>'oic_psds' and exists(select 1 from public.profiles self where self.id=auth.uid() and self.account_status='active' and self.role<>'oic_psds')),'[]'::jsonb)
) $function$
;
revoke all on function public.i_track_create_document(text,text,uuid,text,text) from public,anon;
grant execute on function public.i_track_create_document(text,text,uuid,text,text) to authenticated;
revoke all on function public.i_track_pending_route_action(uuid,text,uuid) from public,anon;
grant execute on function public.i_track_pending_route_action(uuid,text,uuid) to authenticated;
