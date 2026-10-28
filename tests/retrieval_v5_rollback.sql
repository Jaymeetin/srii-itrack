-- Safe end-to-end regression test. All test custody changes roll back.
begin;
do $t$
declare
 admin uuid;
 collector uuid;
 i1 uuid;
 i2 uuid;
 picked jsonb;
 slip jsonb;
 discarded jsonb;
 board jsonb;
 denied boolean;
begin
 select p.id into admin from public.profiles p join auth.users au on au.id=p.id
  where p.role='main_admin' and p.account_status='active' and au.email_confirmed_at is not null limit 1;
 select p.id into collector from public.profiles p join auth.users au on au.id=p.id
  where p.role='school_user' and p.account_status='active' and au.email_confirmed_at is not null limit 1;
 select id into i1 from public.division_transmittal_items
  where document_id is not null and division_status='in_transmittal' limit 1;
 -- An earlier intentionally cancelled TEST compliance is used inside this transaction.
 select id into i2 from public.division_transmittal_items
  where compliance_id is not null and division_status='cancelled' limit 1;
 if i1 is null or i2 is null or admin is null or collector is null then
  raise exception 'Test prerequisites missing: one draft document, one cancelled test compliance, and active accounts';
 end if;
 update public.division_transmittal_items set division_status='submitted_to_division',submitted_at=now()
  where id in (i1,i2);
 perform set_config('request.jwt.claim.sub',admin::text,true);
 perform public.i_track_retrieval_action('set_owner',p_item=>i1,p_owner=>admin);
 perform public.i_track_retrieval_action('set_owner',p_item=>i2,p_owner=>collector);

 perform set_config('request.jwt.claim.sub',collector::text,true);
 board:=public.i_track_retrieval_board();
 if (select count(*) from jsonb_array_elements(board->'available') x
  where x->>'item_id' in (i1::text,i2::text))<>2 then
  raise exception 'Two eligible items missing in retrieval board';
 end if;
 picked:=public.i_track_retrieval_action('pickup',p_item_ids=>array[i1,i2]);
 if (picked->>'count')::int<>2 then raise exception 'Bulk pickup incomplete';end if;
 denied:=false;
 begin perform public.i_track_retrieval_action('pickup',p_item_ids=>array[i1]);
 exception when others then denied:=true;end;
 if not denied then raise exception 'Duplicate pickup accepted';end if;
 denied:=false;
 begin perform public.i_track_retrieval_action('claim',p_item=>i1);
 exception when others then denied:=true;end;
 if not denied then raise exception 'Non-owner was allowed to claim';end if;
 discarded:=public.i_track_retrieval_action('prepare',p_item_ids=>array[i1],p_recipient=>admin);
 perform public.i_track_retrieval_action('discard',p_turnover=>(discarded->>'turnover_id')::uuid);
 if (select division_status from public.division_transmittal_items where id=i1)<>'retrieved_from_division' then
  raise exception 'Discarding draft changed custody';end if;
 slip:=public.i_track_retrieval_action('prepare',p_item_ids=>array[i1],p_recipient=>admin);
 perform public.i_track_retrieval_action('handoff',p_turnover=>(slip->>'turnover_id')::uuid);
 if (select division_status from public.division_transmittal_items where id=i1)<>'forwarded_to_district' then
  raise exception 'Physical handoff did not update existing item';end if;
 denied:=false;
 begin perform public.i_track_retrieval_action('district_ack',p_item_ids=>array[i1]);
 exception when others then denied:=true;end;
 if not denied then raise exception 'Wrong District receiver was allowed to acknowledge';end if;

 perform public.i_track_retrieval_action('claim',p_item=>i2);
 if (select division_status from public.division_transmittal_items where id=i2)<>'received_by_sender' then
  raise exception 'Own-document direct claim failed';end if;
 perform set_config('request.jwt.claim.sub',admin::text,true);
 board:=public.i_track_retrieval_board();
 if not exists (select 1 from jsonb_array_elements(board->'district_queue') x where x->>'item_id'=i1::text)
 then raise exception 'District queue missing handed-over document';end if;
 denied:=false;
 begin perform public.i_track_retrieval_action('claim',p_item=>i1);
 exception when others then denied:=true;end;
 if not denied then raise exception 'Premature final claim allowed before District acknowledgment';end if;

 perform public.i_track_retrieval_action('district_ack',p_item_ids=>array[i1]);
 perform public.i_track_retrieval_action('claim',p_item=>i1);
 if (select d.status from public.documents d join public.division_transmittal_items it on it.document_id=d.id
  where it.id=i1)<>'completed' then raise exception 'Original document did not complete';end if;
 if (select count(*) from public.division_transmittal_events e
  where e.item_id=i1 and e.event_type in (
   'retrieval_pickup','retrieval_district_handoff','retrieval_district_ack','retrieval_owner_received'))<>4 then
  raise exception 'Document history events disconnected';end if;
end $t$;
rollback;
select 'PASS: cross-transmittal pickup, no double pickup, draft discard, District handoff and receipt, only rightful owner claim, original document completion and audit trail' result;