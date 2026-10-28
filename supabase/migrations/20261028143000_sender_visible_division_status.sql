create or replace function public.i_track_document_division_summary()
returns table(document_id uuid,division_status text,transmittal_id uuid,transmittal_number text,item_id uuid)
language sql stable security definer set search_path='' as $fn$
 select distinct on (i.document_id) i.document_id,i.division_status,
  t.id,t.transmittal_number,i.id
 from public.division_transmittal_items i
 join public.division_transmittals t on t.id=i.transmittal_id
 where i.document_id is not null
 and i.division_status<>'cancelled'
 and (select private.i_track_is_operator())
 and private.i_track_can_view_document(i.document_id)
 order by i.document_id,t.created_at desc,i.id desc
$fn$;
revoke all on function public.i_track_document_division_summary() from public,anon;
grant execute on function public.i_track_document_division_summary() to authenticated;