
-- Secure District transmittal board. Private attachments and Drive IDs are never returned.
create or replace function public.i_track_district_list()
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare u uuid:=auth.uid(); admin boolean; result jsonb;
begin
 if u is null or not coalesce((select private.i_track_is_operator()),false)
 then raise exception 'Approved account required';end if;
 admin:=coalesce((select private.i_track_is_admin()),false);
 select jsonb_build_object(
 'eligible',coalesce((
  select jsonb_agg(jsonb_build_object(
   'id',d.id,'tracking_number',d.tracking_number,'subject',d.subject,
   'document_type',d.document_type,'school_id',d.origin_school_id,
   'school_name',coalesce(s.name,'District Office'),'return_required',d.return_required)
   order by d.created_at desc)
  from public.documents d
  left join public.schools s on s.id=d.origin_school_id
  where d.destination='district' and d.status<>'completed'
   and (d.created_by=u or exists(
    select 1 from public.document_routes r where r.document_id=d.id and r.to_user_id=u
     and r.acknowledged_at is not null
     and r.id=(select lr.id from public.document_routes lr where lr.document_id=d.id order by lr.sent_at desc,lr.id desc limit 1)))
   and not exists(select 1 from public.district_transmittal_items di where di.document_id=d.id
     and di.item_status in ('in_transmittal','submitted_for_return','ready_for_owner'))
   and not exists(select 1 from public.division_transmittal_items xi where xi.document_id=d.id
    and xi.division_status not in ('cancelled','not_for_return','received_by_sender','lost'))
 ),'[]'::jsonb),
 'transmittals',coalesce((
  select jsonb_agg(jsonb_build_object(
   'id',t.id,'number',t.transmittal_number,'school_id',t.school_id,
   'school_name',s.name,'school_address',t.school_address,'prepared_by',t.prepared_by,
   'signer_name',t.signer_name,'signer_position',t.signer_position,
   'status',t.status,'created_at',t.created_at,'submitted_at',t.first_submitted_at)
   order by t.created_at desc)
  from public.district_transmittals t join public.schools s on s.id=t.school_id
  where t.prepared_by=u or admin
 ),'[]'::jsonb),
 'items',coalesce((
  select jsonb_agg(jsonb_build_object(
   'id',i.id,'transmittal_id',i.transmittal_id,'document_id',i.document_id,
   'tracking_number',i.tracking_number,'document_label',i.document_label,
   'item_status',i.item_status,'submitted_at',i.submitted_at,
   'return_required',d.return_required,
   'owner_id',coalesce(d.rightful_owner_id,d.created_by),
   'owner_name',coalesce(o.display_name,'Original sender'),
   'school_id',d.origin_school_id)
   order by i.tracking_number)
  from public.district_transmittal_items i
  join public.district_transmittals t on t.id=i.transmittal_id
  join public.documents d on d.id=i.document_id
  left join public.profiles o on o.id=coalesce(d.rightful_owner_id,d.created_by)
  where t.prepared_by=u or admin
 ),'[]'::jsonb),
 'claimable',coalesce((
  select jsonb_agg(jsonb_build_object('id',i.id,'document_id',d.id,
    'tracking_number',i.tracking_number,'document_label',i.document_label,
    'item_status',i.item_status,'transmittal_number',t.transmittal_number)
   order by i.tracking_number)
  from public.district_transmittal_items i
  join public.district_transmittals t on t.id=i.transmittal_id
  join public.documents d on d.id=i.document_id
  where i.item_status='ready_for_owner'
    and coalesce(d.rightful_owner_id,d.created_by)=u
 ),'[]'::jsonb),
 'people',coalesce((
  select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'position',p.position_title)
   order by p.display_name)
  from public.profiles p join auth.users au on au.id=p.id
  where p.account_status='active' and p.role in ('school_user','main_admin','backup_admin')
    and au.email_confirmed_at is not null
 ),'[]'::jsonb)
 ) into result;
 return result;
end $fn$;
revoke all on function public.i_track_district_list() from public,anon;
grant execute on function public.i_track_district_list() to authenticated;

create or replace function public.i_track_district_action(
 p_action text,p_school uuid default null,p_address text default null,
 p_document_ids uuid[] default null,p_transmittal uuid default null,
 p_item_ids uuid[] default null,p_actual_date date default null,
 p_item uuid default null,p_owner uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare
 u uuid:=auth.uid(); admin boolean; t public.district_transmittals%rowtype;
 i public.district_transmittal_items%rowtype; d public.documents%rowtype;
 s public.schools%rowtype; signer public.profiles%rowtype; n integer:=0;
 count_ids integer; good_ids integer; number text; actual_at timestamptz;
 owner_id uuid; complete_now boolean; dt uuid;
begin
 if u is null or not coalesce((select private.i_track_is_operator()),false) then
  raise exception 'Active approved account required';end if;
 admin:=coalesce((select private.i_track_is_admin()),false);
 if p_action in ('create','submit') then
   count_ids:=case when p_action='create' then coalesce(cardinality(p_document_ids),0)
                   else coalesce(cardinality(p_item_ids),0) end;
   if count_ids not between 1 and 100 then raise exception 'Select 1 to 100 documents';end if;
   if p_action='create' then
     select count(distinct x) into good_ids from unnest(p_document_ids) x;
     if array_position(p_document_ids,null) is not null or good_ids<>count_ids then raise exception 'Duplicate or invalid document';end if;
   else
     select count(distinct x) into good_ids from unnest(p_item_ids) x;
     if array_position(p_item_ids,null) is not null or good_ids<>count_ids then raise exception 'Duplicate or invalid document';end if;
   end if;
 end if;
 if p_action='create' then
   select * into s from public.schools where id=p_school and is_active;
   if not found then raise exception 'Select a valid school';end if;
   select * into signer from public.profiles where id=u;
   for d in select * from public.documents where id=any(p_document_ids) order by id for update
   loop
    if d.destination<>'district' or d.status='completed'
      or (d.origin_school_id is not null and d.origin_school_id<>s.id) then
      raise exception 'Choose active District documents belonging to the selected school';
    end if;
    if d.created_by<>u and not exists(
      select 1 from public.document_routes r where r.document_id=d.id and r.to_user_id=u
       and r.acknowledged_at is not null
       and r.id=(select lr.id from public.document_routes lr where lr.document_id=d.id order by lr.sent_at desc,lr.id desc limit 1)
    ) then raise exception 'Document is not yours or currently acknowledged to you';end if;
    if exists(select 1 from public.district_transmittal_items di where di.document_id=d.id
      and di.item_status in ('in_transmittal','submitted_for_return','ready_for_owner'))
      or exists(select 1 from public.division_transmittal_items vi where vi.document_id=d.id
       and vi.division_status not in ('cancelled','received_by_sender','not_for_return','lost'))
    then raise exception 'Document is already in an active transmittal';end if;
    n:=n+1;
   end loop;
   if n<>count_ids then raise exception 'One or more documents are no longer available';end if;
   number:='SRII-DT-'||to_char(now() at time zone 'Asia/Manila','YYYY')||'-'||
     lpad(nextval('public.i_track_district_transmittal_number_seq')::text,6,'0');
   if length(btrim(coalesce(p_address,'')))>250 then raise exception 'School address is too long';end if;
   insert into public.district_transmittals(transmittal_number,school_id,school_address,
    prepared_by,signer_name,signer_position)
   values(number,s.id,case when nullif(btrim(coalesce(p_address,'')),'') is null
    then s.name||', San Remigio, Antique'
    when position(lower(s.name) in lower(p_address))>0 then btrim(p_address)
    else s.name||', '||btrim(p_address) end,
    u,coalesce(nullif(btrim(signer.display_name),''),'Registered User'),
    coalesce(nullif(btrim(signer.position_title),''),'School Personnel'))
   returning * into t;
   for d in select * from public.documents where id=any(p_document_ids) order by id
   loop
    insert into public.district_transmittal_items(transmittal_id,document_id,tracking_number,document_label)
    values(t.id,d.id,d.tracking_number,d.subject);
   end loop;
   insert into public.district_transmittal_events(transmittal_id,actor_id,event_type,details)
    values(t.id,u,'created',jsonb_build_object('count',n,'school',s.name));
   return jsonb_build_object('ok',true,'id',t.id,'number',number,'count',n);
 end if;
 if p_action in ('submit','cancel') then
   if p_transmittal is null then raise exception 'Select a District transmittal';end if;
   select * into t from public.district_transmittals where id=p_transmittal for update;
   if not found or t.prepared_by<>u then raise exception 'Only the preparing user may submit or remove items';end if;
 end if;
 if p_action='submit' then
   if p_actual_date is null or p_actual_date>(now() at time zone 'Asia/Manila')::date
    or p_actual_date<date '2000-01-01' then raise exception 'Enter a valid actual submission date';end if;
   actual_at:=(p_actual_date::timestamp at time zone 'Asia/Manila');
   for i in select * from public.district_transmittal_items
    where id=any(p_item_ids) order by id for update
   loop
    if i.transmittal_id<>t.id or i.item_status<>'in_transmittal' then
     raise exception 'Only unchecked, unsubmitted items on this transmittal can be submitted';end if;
    select * into d from public.documents where id=i.document_id for update;
    if d.status='completed' or d.destination<>'district' then raise exception 'Document already completed or changed destination';end if;
    complete_now:=not d.return_required;
    update public.district_transmittal_items set
     item_status=case when complete_now then 'filed_at_district' else 'submitted_for_return' end,
     submitted_at=actual_at,submitted_by=u where id=i.id;
    update public.documents set status=case when complete_now then 'completed' else 'in_transit' end,
     completion_kind=case when complete_now then 'filed_district' else null end,updated_at=now()
     where id=d.id;
    if complete_now then
      update public.document_routes set status='withdrawn',processed_at=now()
       where document_id=d.id and status='awaiting_ack' and processed_at is null;
    end if;
    insert into public.document_events(document_id,actor_user_id,event_type,note)
    values(d.id,u,case when complete_now then 'filed_at_district' else 'submitted_to_district' end,
     'Physical submission recorded by '||t.signer_name||'; transmittal '||t.transmittal_number||
     case when complete_now then '; No Return' else '; For Return' end);
    insert into public.district_transmittal_events(transmittal_id,item_id,actor_id,event_type,details)
    values(t.id,i.id,u,case when complete_now then 'filed_at_district' else 'submitted_for_return' end,
     jsonb_build_object('actual_date',p_actual_date,'return_required',d.return_required));
    n:=n+1;
   end loop;
   if n<>count_ids then raise exception 'Some selected items are missing';end if;
   update public.district_transmittals set status='submitted',
    first_submitted_at=coalesce(first_submitted_at,actual_at) where id=t.id;
   return jsonb_build_object('ok',true,'count',n,'submitted_at',actual_at);
 elsif p_action='cancel' then
   select * into i from public.district_transmittal_items where id=p_item for update;
   if not found or i.transmittal_id<>t.id or i.item_status<>'in_transmittal' then
    raise exception 'Only unsubmitted draft items may be removed';end if;
   update public.district_transmittal_items set item_status='cancelled' where id=i.id;
   insert into public.district_transmittal_events(transmittal_id,item_id,actor_id,event_type)
    values(t.id,i.id,u,'draft_item_removed');
   return jsonb_build_object('ok',true,'item_id',i.id);
 elsif p_action in ('ready','claim','set_owner') then
   if p_item is null then raise exception 'Select document item';end if;
   select * into i from public.district_transmittal_items where id=p_item for update;
   if not found then raise exception 'District transmittal item not found';end if;
   select * into t from public.district_transmittals where id=i.transmittal_id;
   select * into d from public.documents where id=i.document_id for update;
   if p_action='set_owner' then
    if not admin and d.created_by<>u then raise exception 'Only original sender or administrator may assign owner';end if;
    if i.item_status not in ('in_transmittal','submitted_for_return','ready_for_owner') then
     raise exception 'Cannot change rightful owner after final completion';end if;
    if p_owner is null or not exists(select 1 from public.profiles p join auth.users au on au.id=p.id
      where p.id=p_owner and p.account_status='active' and p.role in ('school_user','main_admin','backup_admin')
       and au.email_confirmed_at is not null) then raise exception 'Select approved rightful owner';end if;
    if coalesce(d.rightful_owner_id,d.created_by)=p_owner then raise exception 'Already rightful owner';end if;
    update public.documents set rightful_owner_id=p_owner,updated_at=now() where id=d.id;
    insert into public.document_events(document_id,actor_user_id,event_type,note)
     values(d.id,u,'rightful_owner_changed','New rightful owner assigned');
    insert into public.district_transmittal_events(transmittal_id,item_id,actor_id,event_type,details)
     values(t.id,i.id,u,'rightful_owner_assigned',jsonb_build_object('owner_id',p_owner));
    return jsonb_build_object('ok',true,'owner_id',p_owner);
   elsif p_action='ready' then
    if i.item_status<>'submitted_for_return' or (not admin and t.prepared_by<>u) then
     raise exception 'Only District administrator or preparing custodian may record a document as ready for rightful owner';end if;
    update public.district_transmittal_items set item_status='ready_for_owner',
     ready_at=now(),ready_by=u where id=i.id;
    insert into public.document_events(document_id,actor_user_id,event_type,note)
     values(d.id,u,'returned_from_district','Physical return from District recorded; ready for rightful owner');
    insert into public.district_transmittal_events(transmittal_id,item_id,actor_id,event_type)
     values(t.id,i.id,u,'ready_for_owner');
    return jsonb_build_object('ok',true,'item_id',i.id);
   else
    owner_id:=coalesce(d.rightful_owner_id,d.created_by);
    if owner_id<>u or i.item_status<>'ready_for_owner' then
     raise exception 'Only rightful owner can confirm a document physically returned from District';end if;
    update public.district_transmittal_items set item_status='received_by_owner',
     final_received_at=now(),final_received_by=u where id=i.id;
    update public.documents set status='completed',completion_kind='returned_owner',updated_at=now()
     where id=d.id;
    update public.document_routes set status='withdrawn',processed_at=now()
     where document_id=d.id and status='awaiting_ack' and processed_at is null;
    insert into public.document_events(document_id,actor_user_id,event_type,note)
     values(d.id,u,'district_final_receipt','Rightful owner confirmed final physical receipt from District');
    insert into public.district_transmittal_events(transmittal_id,item_id,actor_id,event_type)
     values(t.id,i.id,u,'received_by_owner');
    return jsonb_build_object('ok',true,'item_id',i.id);
   end if;
 else
   raise exception 'Unsupported District transmittal action';
 end if;
end $fn$;
revoke all on function public.i_track_district_action(text,uuid,text,uuid[],uuid,uuid[],date,uuid,uuid) from public,anon;
grant execute on function public.i_track_district_action(text,uuid,text,uuid[],uuid,uuid[],date,uuid,uuid) to authenticated;
