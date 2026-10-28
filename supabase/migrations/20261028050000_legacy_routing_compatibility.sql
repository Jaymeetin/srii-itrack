-- Compatibility for existing clients during PWA update.
CREATE OR REPLACE FUNCTION public.i_track_division_forward(p_document uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid();r public.document_routes%rowtype;
begin
 if u is null or not exists(select 1 from public.profiles where id=u and account_status='active' and role<>'oic_psds') then raise exception 'Active user required';end if;
 select * into r from public.document_routes where document_id=p_document order by sent_at desc,id desc limit 1;
 if not found or r.to_user_id<>u or r.status not in ('received','processed') then raise exception 'Only current acknowledged recipient may forward to Division';end if;
 if exists(select 1 from public.division_transmittal_items where document_id=p_document and division_status not in ('received_by_sender','not_for_return','cancelled','lost')) then raise exception 'Already in active Division transmittal';end if;
 insert into public.division_forward_queue(document_id,forwarded_by,route_id) values(p_document,u,r.id)
 on conflict(document_id) do update set forwarded_by=u,forwarded_at=now(),route_id=r.id;
 update public.documents set destination='division',updated_at=now() where id=p_document;
 return true;
end $function$
;
CREATE OR REPLACE FUNCTION public.i_track_route_document(p_route_id uuid, p_next_user_id uuid, p_return boolean DEFAULT false, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE source_route public.document_routes%rowtype; next_route uuid;
BEGIN
 IF NOT (SELECT private.i_track_is_operator()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 SELECT * INTO source_route FROM public.document_routes
 WHERE id=p_route_id FOR UPDATE;
 IF NOT FOUND OR source_route.to_user_id<>auth.uid()
   OR source_route.status<>'received' OR source_route.processed_at IS NOT NULL THEN
   RAISE EXCEPTION 'Document must first be acknowledged and not already routed';
 END IF;
 IF p_next_user_id=auth.uid() OR NOT EXISTS(
   SELECT 1 FROM public.profiles
   WHERE id=p_next_user_id AND account_status='active'
     AND EXISTS(select 1 from auth.users au where au.id=p_next_user_id and au.email_confirmed_at is not null)
     AND role IN ('school_user','main_admin','backup_admin')
 ) THEN RAISE EXCEPTION 'Invalid destination'; END IF;
 IF p_return AND NOT EXISTS(
   SELECT 1 FROM public.documents d
   WHERE d.id=source_route.document_id
    AND (d.created_by=p_next_user_id OR EXISTS(
     SELECT 1 FROM public.document_routes previous
     WHERE previous.document_id=d.id
       AND (previous.from_user_id=p_next_user_id OR previous.to_user_id=p_next_user_id)
    ))
 ) THEN RAISE EXCEPTION 'Return only to originating or involved user'; END IF;
 UPDATE public.document_routes SET processed_at=now() WHERE id=p_route_id;
 INSERT INTO public.document_routes(document_id,from_user_id,to_user_id,route_action,note)
 VALUES(source_route.document_id,auth.uid(),p_next_user_id,
   CASE WHEN p_return THEN 'returned' ELSE 'forwarded' END,p_note)
 RETURNING id INTO next_route;
 UPDATE public.documents
   SET status=CASE WHEN p_return THEN 'returned' ELSE 'in_transit' END,updated_at=now()
   WHERE id=source_route.document_id;
 INSERT INTO public.document_events(document_id,route_id,actor_user_id,event_type,note)
 VALUES(source_route.document_id,next_route,auth.uid(),
   CASE WHEN p_return THEN 'returned' ELSE 'forwarded' END,p_note);
END
$function$
;
CREATE OR REPLACE FUNCTION public.i_track_send_document(p_subject text, p_document_type text, p_recipient_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE d_id uuid; r_id uuid; tracking text; origin uuid;
BEGIN
 IF NOT (SELECT private.i_track_is_operator()) THEN
  RAISE EXCEPTION 'Active school personnel or district administrator required';
 END IF;
 IF nullif(btrim(p_subject),'') IS NULL THEN RAISE EXCEPTION 'Subject required'; END IF;
 IF p_recipient_id=auth.uid() THEN RAISE EXCEPTION 'Choose a different recipient'; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM public.profiles
   WHERE id=p_recipient_id AND account_status='active'
     AND EXISTS(select 1 from auth.users au where au.id=p_recipient_id and au.email_confirmed_at is not null)
     AND role IN ('school_user','main_admin','backup_admin')
 ) THEN RAISE EXCEPTION 'Recipient not available'; END IF;
 SELECT school_id INTO origin FROM public.profiles WHERE id=auth.uid();
 tracking := 'SRII-'||to_char(now(),'YYYY')||'-'||
    lpad(nextval('public.i_track_document_number_seq')::text,6,'0');
 INSERT INTO public.documents
   (tracking_number,subject,document_type,notes,origin_school_id,created_by,status)
 VALUES (tracking,btrim(p_subject),coalesce(nullif(btrim(p_document_type),''),'General'),
   p_notes,origin,auth.uid(),'in_transit') RETURNING id INTO d_id;
 INSERT INTO public.document_routes(document_id,from_user_id,to_user_id,route_action)
 VALUES (d_id,auth.uid(),p_recipient_id,'sent') RETURNING id INTO r_id;
 INSERT INTO public.document_events(document_id,route_id,actor_user_id,event_type)
 VALUES (d_id,r_id,auth.uid(),'sent');
 RETURN tracking;
END
$function$
;
CREATE OR REPLACE FUNCTION public.i_track_send_to_division(p_subject text, p_document_type text, p_notes text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid(); did uuid; tracking text; origin uuid;
begin
 if not (select private.i_track_is_operator()) then raise exception 'Active authorized account required';end if;
 if nullif(btrim(coalesce(p_subject,'')),'') is null then raise exception 'Subject required';end if;
 select school_id into origin from public.profiles where id=u;
 tracking:='SRII-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.i_track_document_number_seq')::text,6,'0');
 insert into public.documents(tracking_number,subject,document_type,notes,origin_school_id,created_by,status,destination)
 values(tracking,btrim(p_subject),coalesce(nullif(btrim(p_document_type),''),'General'),p_notes,origin,u,'in_transit','division') returning id into did;
 insert into public.division_forward_queue(document_id,forwarded_by,route_id) values(did,u,null);
 insert into public.document_events(document_id,actor_user_id,event_type) values(did,u,'sent_to_division');
 return tracking;
end $function$
;
