
-- Atomically record physical custody operations. No browser writes directly to
-- the custody tables. Actual document completion requires rightful owner.
create or replace function public.i_track_retrieval_action(
 p_action text,
 p_item_ids uuid[] default null,
 p_turnover uuid default null,
 p_recipient uuid default null,
 p_owner uuid default null,
 p_item uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare
 u uuid:=auth.uid();
 admin boolean;
 total integer;
 uniq integer;
 v uuid;
 b public.division_retrieval_batches%rowtype;
 tr public.division_retrieval_turnovers%rowtype;
 i public.division_transmittal_items%rowtype;
 d public.documents%rowtype;
 c public.announcement_compliances%rowtype;
 target_owner uuid;
 old_owner uuid;
 owner_profile public.profiles%rowtype;
 n integer:=0;
 number text;
begin
 if u is null or not (select private.i_track_is_operator()) then
   raise exception 'Active approved SRII i-TRACK account required';
 end if;
 select role in ('main_admin','backup_admin') into admin
 from public.profiles where id=u and account_status='active';
 if p_action in ('pickup','prepare','district_ack') then
   total:=coalesce(cardinality(p_item_ids),0);
   if total not between 1 and 100 then
     raise exception 'Check 1 to 100 documents';
   end if;
   if array_position(p_item_ids,null) is not null then
     raise exception 'Invalid item in selection';
   end if;
   select count(distinct x) into uniq from unnest(p_item_ids) x;
   if uniq<>total then raise exception 'Duplicate document in selection'; end if;
 end if;

 if p_action='pickup' then
   -- Item row locks prevent two collectors retrieving the same document.
   for i in select * from public.division_transmittal_items
    where id=any(p_item_ids) order by id for update
   loop
     if i.division_status<>'submitted_to_division' then
       raise exception 'Only documents currently submitted to Division can be retrieved';
     end if;
     if exists(select 1 from public.division_retrieval_batch_items where item_id=i.id) then
       raise exception 'This transmittal item was already collected';
     end if;
     n:=n+1;
   end loop;
   if n<>total then raise exception 'One or more selected Division documents no longer exist';end if;
   number:='SRII-RET-'||to_char(now() at time zone 'Asia/Manila','YYYY')||'-'||
     lpad(nextval('public.i_track_retrieval_batch_number_seq')::text,6,'0');
   insert into public.division_retrieval_batches(batch_number,retriever_id)
    values(number,u) returning * into b;
   for i in select * from public.division_transmittal_items
    where id=any(p_item_ids) order by id for update
   loop
     insert into public.division_retrieval_batch_items(batch_id,item_id)
     values(b.id,i.id);
     update public.division_transmittal_items set
       division_status='retrieved_from_division',
       retrieved_from_division_at=now(),retrieved_from_division_by=u
     where id=i.id;
     insert into public.division_transmittal_events(
      transmittal_id,item_id,actor_id,event_type,details)
     values(i.transmittal_id,i.id,u,'retrieval_pickup',
      jsonb_build_object('from','submitted_to_division',
       'to','retrieved_from_division','retrieval_number',number,'batch_id',b.id));
   end loop;
   return jsonb_build_object('ok',true,'batch_id',b.id,'number',number,'count',total);

 elsif p_action='prepare' then
   if p_recipient is null or not exists(
    select 1 from public.profiles p join auth.users au on au.id=p.id
    where p.id=p_recipient and p.account_status='active'
     and (p.role in ('main_admin','backup_admin') or
       (p.role='school_user' and p.school_id is null))
     and au.email_confirmed_at is not null
   ) then raise exception 'Choose an approved District Office recipient';end if;
   for i in select * from public.division_transmittal_items
    where id=any(p_item_ids) order by id for update
   loop
     if i.division_status<>'retrieved_from_division' or
       i.retrieved_from_division_by<>u then
       raise exception 'You may prepare a turnover only for documents you actually retrieved';
     end if;
     if not exists(select 1 from public.division_retrieval_batch_items bi
      join public.division_retrieval_batches b on b.id=bi.batch_id
      where bi.item_id=i.id and b.retriever_id=u) then
       raise exception 'Item lacks your retrieval batch';
     end if;
     if exists(select 1 from public.division_retrieval_turnover_items
      where item_id=i.id and active) then
       raise exception 'This document already belongs to an active turnover slip';
     end if;
     n:=n+1;
   end loop;
   if n<>total then raise exception 'One or more selected documents are unavailable';end if;
   number:='SRII-TOV-'||to_char(now() at time zone 'Asia/Manila','YYYY')||'-'||
     lpad(nextval('public.i_track_retrieval_turnover_number_seq')::text,6,'0');
   insert into public.division_retrieval_turnovers(
    turnover_number,retriever_id,recipient_id,status)
    values(number,u,p_recipient,'prepared') returning * into tr;
   insert into public.division_retrieval_turnover_items(turnover_id,item_id)
    select tr.id,x.id from unnest(p_item_ids) x(id);
   return jsonb_build_object('ok',true,'turnover_id',tr.id,'number',number,'count',total,'status','prepared');

 elsif p_action='handoff' then
   select * into tr from public.division_retrieval_turnovers
     where id=p_turnover for update;
   if not found or tr.retriever_id<>u or tr.status<>'prepared' then
     raise exception 'Only the retriever may confirm an unsubmitted turnover slip';
   end if;
   if not exists(select 1 from public.profiles p
      where p.id=tr.recipient_id and p.account_status='active') then
     raise exception 'District recipient account is no longer active';
   end if;
   for i in select * from public.division_transmittal_items
     where id in (select vi.item_id from public.division_retrieval_turnover_items vi
      where vi.turnover_id=tr.id and vi.active)
     order by id for update
   loop
     if i.division_status<>'retrieved_from_division' or i.retrieved_from_division_by<>u then
       raise exception 'Turnover documents changed; review the slip before handoff';
     end if;
     n:=n+1;
   end loop;
   if n=0 then raise exception 'No documents are on this turnover slip';end if;
   for i in select * from public.division_transmittal_items
     where id in (select item_id from public.division_retrieval_turnover_items where turnover_id=tr.id and active)
     order by id for update
   loop
     update public.division_transmittal_items set
      division_status='forwarded_to_district',
      district_forwarded_at=now(),district_forwarded_by=u,district_recipient_id=tr.recipient_id
      where id=i.id;
     insert into public.division_transmittal_events(transmittal_id,item_id,actor_id,event_type,details)
      values(i.transmittal_id,i.id,u,'retrieval_district_handoff',
       jsonb_build_object('to','forwarded_to_district','turnover_id',tr.id,
        'turnover_number',tr.turnover_number,'district_recipient',tr.recipient_id));
   end loop;
   update public.division_retrieval_turnovers set
    status='handed_over',handed_over_at=now() where id=tr.id;
   insert into public.division_notifications(recipient_id,message)
    values(tr.recipient_id,'District turnover requires acknowledgment: '||tr.turnover_number||' ('||n||' documents)');
   return jsonb_build_object('ok',true,'turnover_id',tr.id,'count',n,'status','handed_over');

 elsif p_action='discard' then
   select * into tr from public.division_retrieval_turnovers
    where id=p_turnover for update;
   if not found or tr.status<>'prepared' or tr.retriever_id<>u then
    raise exception 'Only your unsubmitted slip can be discarded';
   end if;
   update public.division_retrieval_turnover_items set active=false
    where turnover_id=tr.id;
   update public.division_retrieval_turnovers set
    status='cancelled',cancelled_at=now() where id=tr.id;
   return jsonb_build_object('ok',true,'status','cancelled');

 elsif p_action='district_ack' then
   for i in select * from public.division_transmittal_items
     where id=any(p_item_ids) order by id for update
   loop
     if i.division_status<>'forwarded_to_district' or i.district_recipient_id<>u then
       raise exception 'Only the assigned District recipient can acknowledge each forwarded document';
     end if;
     update public.division_transmittal_items set
      division_status='received_at_district',district_received_at=now(),district_received_by=u
     where id=i.id;
     insert into public.division_transmittal_events(
      transmittal_id,item_id,actor_id,event_type,details)
     values(i.transmittal_id,i.id,u,'retrieval_district_ack',
      jsonb_build_object('from','forwarded_to_district','to','received_at_district'));
     select coalesce(i.rightful_owner_id,d.created_by,c.submitted_by) into target_owner
      from public.division_transmittal_items j
      left join public.documents d on d.id=j.document_id
      left join public.announcement_compliances c on c.id=j.compliance_id
      where j.id=i.id;
     if target_owner is not null and target_owner<>u then
       insert into public.division_notifications(recipient_id,transmittal_id,item_id,message)
        values(target_owner,i.transmittal_id,i.id,
         'Your document is ready to claim at District: '||coalesce(i.tracking_number,'Document'));
     end if;
     n:=n+1;
   end loop;
   if n<>total then raise exception 'One or more selected documents are not assigned to you';end if;
   return jsonb_build_object('ok',true,'count',n,'status','received_at_district');

 elsif p_action='claim' then
   if p_item is null then raise exception 'Select a document to claim';end if;
   select * into i from public.division_transmittal_items where id=p_item for update;
   if not found then raise exception 'Document not found';end if;
   select * into d from public.documents where id=i.document_id;
   select * into c from public.announcement_compliances where id=i.compliance_id;
   target_owner:=coalesce(i.rightful_owner_id,d.created_by,c.submitted_by);
   if target_owner is null or target_owner<>u then
     raise exception 'Only the designated rightful owner may confirm final receipt';
   end if;
   if not (i.division_status='received_at_district' or
      (i.division_status='retrieved_from_division' and i.retrieved_from_division_by=u)) then
     raise exception 'Final receipt requires District acknowledgment or collection of your own document';
   end if;
   update public.division_transmittal_items set
      division_status='received_by_sender',return_status='returned',
      final_received_at=now(),final_received_by=u
    where id=i.id;
   if i.document_id is not null then
    update public.documents set status='completed',updated_at=now() where id=i.document_id;
    update public.document_routes set status='withdrawn',processed_at=now()
     where document_id=i.document_id and status='awaiting_ack' and processed_at is null;
    insert into public.document_events(document_id,actor_user_id,event_type,note)
     values(i.document_id,u,'division_final_receipt','Final physical document receipt confirmed by the rightful owner');
   end if;
   insert into public.division_transmittal_events(transmittal_id,item_id,actor_id,event_type,details)
    values(i.transmittal_id,i.id,u,'retrieval_owner_received',
     jsonb_build_object('from',i.division_status,'to','received_by_sender','owner_id',u));
   return jsonb_build_object('ok',true,'status','received_by_sender','item_id',i.id);

 elsif p_action='set_owner' then
   if p_item is null or p_owner is null then raise exception 'Choose a document and rightful owner';end if;
   select * into i from public.division_transmittal_items where id=p_item for update;
   if not found or i.division_status not in (
    'in_transmittal','submitted_to_division','retrieved_from_division',
    'forwarded_to_district','received_at_district') then
      raise exception 'Only pending documents can have their owner changed';
   end if;
   select * into d from public.documents where id=i.document_id;
   select * into c from public.announcement_compliances where id=i.compliance_id;
   if not admin and coalesce(d.created_by,c.submitted_by) is distinct from u then
     raise exception 'Only the original sender or district administrator may designate the rightful owner';
   end if;
   select p.* into owner_profile from public.profiles p join auth.users au on au.id=p.id
    where p.id=p_owner and p.account_status='active'
      and p.role in ('school_user','main_admin','backup_admin')
      and au.email_confirmed_at is not null;
   if not found then raise exception 'Choose an approved, email-verified rightful owner';end if;
   old_owner:=coalesce(i.rightful_owner_id,d.created_by,c.submitted_by);
   if old_owner=p_owner then raise exception 'This person is already the rightful owner';end if;
   update public.division_transmittal_items set rightful_owner_id=p_owner where id=i.id;
   insert into public.division_transmittal_events(transmittal_id,item_id,actor_id,event_type,details)
    values(i.transmittal_id,i.id,u,'retrieval_owner_assigned',
     jsonb_build_object('previous_owner',old_owner,'new_owner',p_owner));
   insert into public.division_notifications(recipient_id,transmittal_id,item_id,message)
    values(p_owner,i.transmittal_id,i.id,
     'You were designated rightful owner of document '||coalesce(i.tracking_number,''));
   return jsonb_build_object('ok',true,'owner_id',p_owner,'owner_name',owner_profile.display_name);

 else
  raise exception 'Unknown retrieval action';
 end if;
end $fn$;

revoke all on function public.i_track_retrieval_action(text,uuid[],uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.i_track_retrieval_action(text,uuid[],uuid,uuid,uuid,uuid) to authenticated;
