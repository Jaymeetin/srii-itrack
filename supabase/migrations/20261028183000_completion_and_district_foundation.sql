
-- Completion purpose is distinct from physical return. Existing records keep
-- return_required=true, so historical retrieval behavior is unchanged.
alter table public.documents add column if not exists return_required boolean not null default true;
alter table public.documents add column if not exists completion_kind text;
alter table public.documents add column if not exists rightful_owner_id uuid references public.profiles(id) on delete set null;
alter table public.documents drop constraint if exists documents_destination_check;
alter table public.documents add constraint documents_destination_check check(destination in ('school','district','division','personal'));
alter table public.documents add constraint documents_completion_kind_check check (
 completion_kind is null or completion_kind in ('personal_record','filed_division','filed_district','returned_owner')
);
alter table public.schools add column if not exists postal_address text;

create sequence if not exists public.i_track_district_transmittal_number_seq;
create table if not exists public.district_transmittals(
 id uuid primary key default gen_random_uuid(),
 transmittal_number text not null unique,
 school_id uuid not null references public.schools(id),
 school_address text not null,
 prepared_by uuid not null references public.profiles(id),
 signer_name text not null,
 signer_position text not null,
 status text not null default 'draft' check(status in ('draft','submitted')),
 created_at timestamptz not null default now(),
 first_submitted_at timestamptz
);
create table if not exists public.district_transmittal_items(
 id uuid primary key default gen_random_uuid(),
 transmittal_id uuid not null references public.district_transmittals(id),
 document_id uuid not null references public.documents(id),
 tracking_number text not null,
 document_label text not null,
 item_status text not null default 'in_transmittal' check(item_status in (
  'in_transmittal','filed_at_district','submitted_for_return','ready_for_owner','received_by_owner','cancelled'
 )),
 submitted_at timestamptz,
 submitted_by uuid references public.profiles(id),
 ready_at timestamptz,
 ready_by uuid references public.profiles(id),
 final_received_at timestamptz,
 final_received_by uuid references public.profiles(id),
 unique(transmittal_id,document_id)
);
create unique index if not exists district_item_one_active_route on public.district_transmittal_items(document_id)
 where item_status in ('in_transmittal','submitted_for_return','ready_for_owner');
create table if not exists public.district_transmittal_events(
 id bigint generated always as identity primary key,
 transmittal_id uuid not null references public.district_transmittals(id),
 item_id uuid references public.district_transmittal_items(id),
 actor_id uuid not null references public.profiles(id),
 event_type text not null,
 details jsonb not null default '{}'::jsonb,
 happened_at timestamptz not null default now()
);
create index if not exists district_items_t_id on public.district_transmittal_items(transmittal_id);
create index if not exists district_events_transmittal on public.district_transmittal_events(transmittal_id,happened_at);

create table if not exists public.document_type_admin_events(
 id bigint generated always as identity primary key,
 actor_id uuid not null references public.profiles(id),
 action text not null,
 document_type text not null,
 reason text,
 request_id bigint references public.document_type_requests(id),
 happened_at timestamptz not null default now()
);

alter table public.district_transmittals enable row level security;
alter table public.district_transmittal_items enable row level security;
alter table public.district_transmittal_events enable row level security;
alter table public.document_type_admin_events enable row level security;
revoke all on public.district_transmittals,public.district_transmittal_items,
 public.district_transmittal_events,public.document_type_admin_events from public,anon,authenticated;

create or replace function public.i_track_document_types_admin()
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare result jsonb;
begin
 if auth.uid() is null or not coalesce((select private.i_track_is_admin()),false)
 then raise exception 'District administrator account required';end if;
 select jsonb_build_object(
 'types',coalesce((select jsonb_agg(jsonb_build_object('name',t.name,'active',t.is_active,
 'approved_at',t.approved_at,'approved_by',t.approved_by) order by t.name)
 from public.document_types t),'[]'::jsonb),
 'requests',coalesce((select jsonb_agg(jsonb_build_object(
 'id',r.id,'name',r.requested_name,'status',r.status,'requested_by',r.suggested_by,
 'requester_name',coalesce(p.display_name,'User'),'submitted_at',r.submitted_at,
 'reviewed_at',r.reviewed_at) order by r.submitted_at desc)
 from public.document_type_requests r left join public.profiles p on p.id=r.suggested_by
 where r.status='pending'),'[]'::jsonb)
 ) into result;
 return result;
end $fn$;
revoke all on function public.i_track_document_types_admin() from public,anon;
grant execute on function public.i_track_document_types_admin() to authenticated;

create or replace function public.i_track_document_type_manage(
 p_action text,p_name text,p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare u uuid:=auth.uid(); existing text; n text:=btrim(coalesce(p_name,'')); currently_active boolean;
begin
 if u is null or not coalesce((select private.i_track_is_admin()),false) then
  raise exception 'District administrator required';end if;
 if char_length(n) not between 2 and 140 or n ~ '[[:cntrl:]]' then
  raise exception 'Document type name must be 2–140 printable characters';end if;
 select name,is_active into existing,currently_active from public.document_types
  where lower(name)=lower(n) limit 1 for update;
 if p_action='add' then
  if existing is not null and currently_active then raise exception 'Type already approved';end if;
  if existing is not null then
   update public.document_types set is_active=true,approved_by=u,approved_at=now() where name=existing;
  else
   insert into public.document_types(name,is_active,approved_by) values(n,true,u);
  end if;
 elsif p_action='deactivate' then
  if existing is null or not currently_active then raise exception 'Type is already inactive or missing';end if;
  update public.document_types set is_active=false where name=existing;
 elsif p_action='reactivate' then
  if existing is null or currently_active then raise exception 'Type is already active or missing';end if;
  update public.document_types set is_active=true,approved_by=u,approved_at=now() where name=existing;
 else raise exception 'Invalid document-type action';end if;
 insert into public.document_type_admin_events(actor_id,action,document_type,reason)
 values(u,p_action,coalesce(existing,n),nullif(btrim(coalesce(p_reason,'')),''));
 return jsonb_build_object('ok',true,'name',coalesce(existing,n),'action',p_action);
end $fn$;
revoke all on function public.i_track_document_type_manage(text,text,text) from public,anon;
grant execute on function public.i_track_document_type_manage(text,text,text) to authenticated;
