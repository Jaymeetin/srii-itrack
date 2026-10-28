
create or replace function public.i_track_document_district_summary()
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare u uuid:=auth.uid(); result jsonb;
begin
 if u is null or not coalesce((select private.i_track_is_operator()),false) then raise exception 'Approved account required';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'document_id',i.document_id,'item_id',i.id,'transmittal_number',t.transmittal_number,
  'item_status',i.item_status,'submitted_at',i.submitted_at,'school_id',t.school_id)
  order by t.created_at desc),'[]'::jsonb)
 into result
 from public.district_transmittal_items i
 join public.district_transmittals t on t.id=i.transmittal_id
 join public.documents d on d.id=i.document_id
 where i.item_status<>'cancelled'
 and (d.created_by=u or coalesce((select private.i_track_is_admin()),false)
  or private.i_track_can_view_document(d.id));
 return result;
end $fn$;
revoke all on function public.i_track_document_district_summary() from public,anon;
grant execute on function public.i_track_document_district_summary() to authenticated;

create or replace function public.i_track_document_district_events(p_document_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare u uuid:=auth.uid(); result jsonb;
begin
 if u is null or not coalesce((select private.i_track_is_operator()),false) then raise exception 'Approved account required';end if;
 if not exists(select 1 from public.documents d where d.id=p_document_id
  and (d.created_by=u or coalesce((select private.i_track_is_admin()),false)
   or private.i_track_can_view_document(d.id))) then
   raise exception 'Document not accessible';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'event_type',e.event_type,'happened_at',e.happened_at,
   'actor_name',coalesce(p.display_name,'District personnel'),
   'transmittal_number',t.transmittal_number,'details',e.details)
   order by e.happened_at),'[]'::jsonb)
 into result
 from public.district_transmittal_events e
 join public.district_transmittals t on t.id=e.transmittal_id
 left join public.district_transmittal_items i on i.id=e.item_id
 left join public.profiles p on p.id=e.actor_id
 where (i.document_id=p_document_id
   or (e.item_id is null and exists(select 1 from public.district_transmittal_items x
     where x.transmittal_id=t.id and x.document_id=p_document_id)));
 return result;
end $fn$;
revoke all on function public.i_track_document_district_events(uuid) from public,anon;
grant execute on function public.i_track_document_district_events(uuid) to authenticated;
