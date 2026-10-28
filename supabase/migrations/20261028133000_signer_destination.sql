CREATE OR REPLACE FUNCTION public.i_track_change_document_destination(p_document uuid, p_destination text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.documents%rowtype; r public.document_routes%rowtype; u uuid:=auth.uid();
begin
 if not private.i_track_is_operator() then raise exception 'Approved account required';end if;
 if p_destination not in ('school','district','division') then raise exception 'Invalid destination';end if;
 select * into d from public.documents where id=p_document for update;
 if not found then raise exception 'Document not found';end if;
 select * into r from public.document_routes where document_id=d.id order by sent_at desc,id desc limit 1;
 if not (d.created_by=u or (r.to_user_id=u and r.acknowledged_at is not null)) then raise exception 'Not current document handler';end if;
 if d.status='completed' or exists(select 1 from public.division_transmittal_items i where i.document_id=d.id and i.division_status not in ('received_by_sender','not_for_return','cancelled','lost')) then raise exception 'Active or completed transmittal';end if;
 if d.destination=p_destination then return true;end if;
 update public.documents set destination=p_destination,updated_at=now() where id=d.id;
 if p_destination='division' then
  insert into public.division_forward_queue(document_id,forwarded_by,route_id) values(d.id,u,null)
  on conflict(document_id) do update set forwarded_by=u,forwarded_at=now(),route_id=null;
 end if;
 insert into public.document_events(document_id,actor_user_id,event_type,note) values(d.id,u,'destination_changed',d.destination||' to '||p_destination);
 return true;
end $function$
;

CREATE OR REPLACE FUNCTION public.i_track_edit_transmittal_item(p_item uuid, p_label text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare i public.division_transmittal_items%rowtype; t public.division_transmittals%rowtype;
begin
 select * into i from public.division_transmittal_items where id=p_item for update;
 if not found then raise exception 'Item unavailable';end if;
 select * into t from public.division_transmittals where id=i.transmittal_id;
 if (t.prepared_by<>auth.uid() and not private.i_track_is_admin()) then raise exception 'Only preparer or admin may edit';end if;
 if i.division_status<>'in_transmittal' or t.dispatched_at is not null then raise exception 'Cannot edit after physical submission';end if;
 if length(btrim(coalesce(p_label,''))) not between 2 and 240 then raise exception 'Document name must be 2-240 characters';end if;
 update public.division_transmittal_items set document_label=btrim(p_label) where id=i.id;
 insert into public.division_transmittal_events(transmittal_id,item_id,actor_id,event_type,details)
 values(t.id,i.id,auth.uid(),'item_renamed',jsonb_build_object('old',i.document_label,'new',btrim(p_label)));
 return true;
end $function$
;

CREATE OR REPLACE FUNCTION public.i_track_edit_transmittal_signer(p_transmittal uuid, p_name text, p_position text, p_office text, p_school text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.division_transmittals%rowtype;
begin
 select * into t from public.division_transmittals where id=p_transmittal for update;
 if not found or (t.prepared_by<>auth.uid() and not private.i_track_is_admin()) then raise exception 'Preparer or administrator required';end if;
 if t.dispatched_at is not null then raise exception 'Signer cannot be changed after submission';end if;
 if length(btrim(coalesce(p_name,''))) not between 2 and 120 or length(btrim(coalesce(p_position,''))) not between 2 and 120 or length(btrim(coalesce(p_office,''))) not between 2 and 150 then raise exception 'Complete signer name, position and designation';end if;
 update public.division_transmittals set signer_name=btrim(p_name),signer_position=btrim(p_position),signer_office=btrim(p_office),authorized_school_name=nullif(btrim(coalesce(p_school,'')),''),updated_at=now() where id=t.id;
 insert into public.division_transmittal_events(transmittal_id,actor_id,event_type,details) values(t.id,auth.uid(),'signer_updated',jsonb_build_object('signer',p_name,'school',p_school));
 return true;
end $function$
;