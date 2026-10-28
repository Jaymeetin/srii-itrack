
-- SRII i-TRACK Division Retrieval v5: custody batches are linked to the
-- existing transmittal item. No new document/tracking ID is created.
create sequence if not exists public.i_track_retrieval_batch_number_seq;
create sequence if not exists public.i_track_retrieval_turnover_number_seq;

create table if not exists public.division_retrieval_batches(
 id uuid primary key default gen_random_uuid(),
 batch_number text not null unique,
 retriever_id uuid not null references public.profiles(id),
 created_at timestamptz not null default now()
);
create table if not exists public.division_retrieval_batch_items(
 batch_id uuid not null references public.division_retrieval_batches(id) on delete restrict,
 item_id uuid not null unique references public.division_transmittal_items(id) on delete restrict,
 primary key(batch_id,item_id)
);
create table if not exists public.division_retrieval_turnovers(
 id uuid primary key default gen_random_uuid(),
 turnover_number text not null unique,
 retriever_id uuid not null references public.profiles(id),
 recipient_id uuid not null references public.profiles(id),
 status text not null default 'prepared' check(status in ('prepared','handed_over','cancelled')),
 created_at timestamptz not null default now(),
 handed_over_at timestamptz,
 cancelled_at timestamptz
);
create table if not exists public.division_retrieval_turnover_items(
 turnover_id uuid not null references public.division_retrieval_turnovers(id) on delete restrict,
 item_id uuid not null references public.division_transmittal_items(id) on delete restrict,
 active boolean not null default true,
 primary key(turnover_id,item_id)
);
create unique index if not exists division_retrieval_turnover_active_item
 on public.division_retrieval_turnover_items(item_id) where active;
alter table public.division_transmittal_items
 add column if not exists rightful_owner_id uuid references public.profiles(id) on delete set null;
create index if not exists division_retrieval_items_owner
 on public.division_transmittal_items(rightful_owner_id);
create index if not exists division_retrieval_items_status
 on public.division_transmittal_items(division_status);
create index if not exists division_retrieval_turnovers_recipient
 on public.division_retrieval_turnovers(recipient_id);

alter table public.division_retrieval_batches enable row level security;
alter table public.division_retrieval_batch_items enable row level security;
alter table public.division_retrieval_turnovers enable row level security;
alter table public.division_retrieval_turnover_items enable row level security;
revoke all on public.division_retrieval_batches,
 public.division_retrieval_batch_items,
 public.division_retrieval_turnovers,
 public.division_retrieval_turnover_items from public,anon,authenticated;

-- Only authenticated active routing accounts may read the board.
-- The metadata lists all still-at-Division physical items (as the existing
-- retrieval checklist already did), but private files are never exposed.
create or replace function public.i_track_retrieval_board()
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare u uuid:=auth.uid(); result jsonb;
begin
 if u is null or not (select private.i_track_is_operator()) then
   raise exception 'Approved routing account required';
 end if;
 select jsonb_build_object(
 'available',coalesce((
   select jsonb_agg(jsonb_build_object(
    'item_id',i.id,'tracking_number',i.tracking_number,'document_label',i.document_label,
    'document_type',i.document_type,'school_name',coalesce(s.name,'District Office'),
    'transmittal_number',t.transmittal_number,'transmittal_id',t.id,
    'owner_id',coalesce(i.rightful_owner_id,d.created_by,c.submitted_by))
    order by i.tracking_number)
   from public.division_transmittal_items i
   join public.division_transmittals t on t.id=i.transmittal_id
   left join public.schools s on s.id=i.school_id
   left join public.documents d on d.id=i.document_id
   left join public.announcement_compliances c on c.id=i.compliance_id
   where i.division_status='submitted_to_division'
 ),'[]'::jsonb),
 'my_batches',coalesce((
   select jsonb_agg(jsonb_build_object(
     'id',b.id,'number',b.batch_number,'created_at',b.created_at,
     'retriever_id',b.retriever_id) order by b.created_at desc)
   from public.division_retrieval_batches b where b.retriever_id=u
 ),'[]'::jsonb),
 'my_batch_items',coalesce((
   select jsonb_agg(jsonb_build_object(
     'batch_id',bi.batch_id,'item_id',i.id,'tracking_number',i.tracking_number,
     'document_label',i.document_label,'school_name',coalesce(s.name,'District Office'),
     'division_status',i.division_status,'transmittal_number',t.transmittal_number,
     'owner_id',coalesce(i.rightful_owner_id,d.created_by,c.submitted_by),
     'owner_name',coalesce(owner.display_name,'Original sender'),
     'retrieved_at',i.retrieved_from_division_at)
     order by i.tracking_number)
   from public.division_retrieval_batch_items bi
   join public.division_retrieval_batches b on b.id=bi.batch_id
   join public.division_transmittal_items i on i.id=bi.item_id
   join public.division_transmittals t on t.id=i.transmittal_id
   left join public.schools s on s.id=i.school_id
   left join public.documents d on d.id=i.document_id
   left join public.announcement_compliances c on c.id=i.compliance_id
   left join public.profiles owner on owner.id=coalesce(i.rightful_owner_id,d.created_by,c.submitted_by)
   where b.retriever_id=u
 ),'[]'::jsonb),
 'turnovers',coalesce((
   select jsonb_agg(jsonb_build_object(
     'id',v.id,'number',v.turnover_number,'status',v.status,
     'retriever_id',v.retriever_id,'retriever_name',coalesce(r.display_name,'Retriever'),
     'retriever_position',coalesce(r.position_title,''),
     'recipient_id',v.recipient_id,'recipient_name',coalesce(p.display_name,'District recipient'),
     'created_at',v.created_at,'handed_over_at',v.handed_over_at)
     order by v.created_at desc)
   from public.division_retrieval_turnovers v
   left join public.profiles r on r.id=v.retriever_id
   left join public.profiles p on p.id=v.recipient_id
   where (v.retriever_id=u or v.recipient_id=u or (select private.i_track_is_admin()))
   and v.status<>'cancelled'
 ),'[]'::jsonb),
 'turnover_items',coalesce((
   select jsonb_agg(jsonb_build_object(
     'turnover_id',vi.turnover_id,'item_id',i.id,'tracking_number',i.tracking_number,
     'document_label',i.document_label,'document_type',i.document_type,
     'school_name',coalesce(s.name,'District Office'),'division_status',i.division_status)
     order by i.tracking_number)
   from public.division_retrieval_turnover_items vi
   join public.division_retrieval_turnovers v on v.id=vi.turnover_id
   join public.division_transmittal_items i on i.id=vi.item_id
   left join public.schools s on s.id=i.school_id
   where vi.active and v.status<>'cancelled'
   and (v.retriever_id=u or v.recipient_id=u or (select private.i_track_is_admin()))
 ),'[]'::jsonb),
 'district_queue',coalesce((
   select jsonb_agg(jsonb_build_object(
     'item_id',i.id,'tracking_number',i.tracking_number,
     'document_label',i.document_label,'school_name',coalesce(s.name,'District Office'),
     'division_status',i.division_status,'transmittal_number',t.transmittal_number)
     order by i.tracking_number)
   from public.division_transmittal_items i
   join public.division_transmittals t on t.id=i.transmittal_id
   left join public.schools s on s.id=i.school_id
   where i.division_status='forwarded_to_district' and i.district_recipient_id=u
 ),'[]'::jsonb),
 'claimable',coalesce((
   select jsonb_agg(jsonb_build_object(
     'item_id',i.id,'tracking_number',i.tracking_number,
     'document_label',i.document_label,'school_name',coalesce(s.name,'District Office'),
     'division_status',i.division_status,
     'retriever_id',i.retrieved_from_division_by,'transmittal_number',t.transmittal_number)
     order by i.tracking_number)
   from public.division_transmittal_items i
   join public.division_transmittals t on t.id=i.transmittal_id
   left join public.schools s on s.id=i.school_id
   left join public.documents d on d.id=i.document_id
   left join public.announcement_compliances c on c.id=i.compliance_id
   where coalesce(i.rightful_owner_id,d.created_by,c.submitted_by)=u
   and (i.division_status='received_at_district'
     or (i.division_status='retrieved_from_division' and i.retrieved_from_division_by=u))
 ),'[]'::jsonb),
 'manageable_owners',coalesce((
   select jsonb_agg(jsonb_build_object(
     'item_id',i.id,'tracking_number',i.tracking_number,
     'document_label',i.document_label,'owner_id',coalesce(i.rightful_owner_id,d.created_by,c.submitted_by),
     'owner_name',coalesce(owner.display_name,'Unassigned'),
     'division_status',i.division_status) order by i.tracking_number)
   from public.division_transmittal_items i
   left join public.documents d on d.id=i.document_id
   left join public.announcement_compliances c on c.id=i.compliance_id
   left join public.profiles owner on owner.id=coalesce(i.rightful_owner_id,d.created_by,c.submitted_by)
   where i.division_status in ('in_transmittal','submitted_to_division','retrieved_from_division','forwarded_to_district','received_at_district')
   and ((select private.i_track_is_admin()) or d.created_by=u or c.submitted_by=u)
 ),'[]'::jsonb),
 'district_recipients',coalesce((
   select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'position',p.position_title)
     order by p.display_name)
   from public.profiles p join auth.users au on au.id=p.id
   where p.account_status='active' and p.role in ('main_admin','backup_admin','school_user')
     and (p.school_id is null or p.role in ('main_admin','backup_admin'))
     and au.email_confirmed_at is not null
 ),'[]'::jsonb),
 'claimant_accounts',coalesce((
   select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'position',p.position_title)
    order by p.display_name)
   from public.profiles p join auth.users au on au.id=p.id
   where p.account_status='active' and p.role in ('school_user','main_admin','backup_admin')
     and au.email_confirmed_at is not null
 ),'[]'::jsonb)
 ) into result;
 return result;
end $fn$;

revoke all on function public.i_track_retrieval_board() from public,anon;
grant execute on function public.i_track_retrieval_board() to authenticated;
