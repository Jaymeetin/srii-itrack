create or replace function public.i_track_set_document_return_rule(
 p_document uuid,p_return_required boolean)
returns boolean language plpgsql security definer set search_path='' as $fn$
declare u uuid:=auth.uid(); d public.documents%rowtype;
begin
 if u is null or not coalesce((select private.i_track_is_operator()),false) then
  raise exception 'Approved account required';end if;
 if p_return_required is null then raise exception 'Choose For Return or No Return';end if;
 select * into d from public.documents where id=p_document for update;
 if not found or d.status='completed' or d.destination not in ('district','division') then
  raise exception 'Only open District or Division documents may change their return rule';end if;
 if d.created_by<>u and not coalesce((select private.i_track_is_admin()),false)
 and not exists(select 1 from public.document_routes r where r.document_id=d.id
  and r.to_user_id=u and r.acknowledged_at is not null
  and r.id=(select lr.id from public.document_routes lr where lr.document_id=d.id
   order by lr.sent_at desc,lr.id desc limit 1))
 then raise exception 'Only original sender, current acknowledged handler, or admin may change the return rule';end if;
 if exists(select 1 from public.division_transmittal_items i where i.document_id=d.id
  and i.division_status not in ('cancelled','in_transmittal'))
 or exists(select 1 from public.district_transmittal_items i where i.document_id=d.id
  and i.item_status not in ('cancelled','in_transmittal'))
 then raise exception 'Return rule is locked after actual submission; use an audited correction process';end if;
 if d.return_required=p_return_required then return true;end if;
 update public.documents set return_required=p_return_required,updated_at=now() where id=d.id;
 insert into public.document_events(document_id,actor_user_id,event_type,note)
 values(d.id,u,'return_rule_changed',
  case when p_return_required then 'Changed to For Return' else 'Changed to No Return' end);
 return true;
end $fn$;
revoke all on function public.i_track_set_document_return_rule(uuid,boolean) from public,anon;
grant execute on function public.i_track_set_document_return_rule(uuid,boolean) to authenticated;
