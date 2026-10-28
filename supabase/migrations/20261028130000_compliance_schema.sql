
create sequence if not exists public.i_track_compliance_seq;
create table if not exists public.announcement_compliances (
 id uuid primary key default gen_random_uuid(),
 assignment_id uuid not null unique references public.announcement_assignments(id),
 school_id uuid references public.schools(id),
 compliance_number text not null unique,
 submitted_by uuid references public.profiles(id),
 submitted_at timestamptz not null default now(),
 status text not null default 'pending_verification' check(status in ('pending_verification','verified','returned')),
 current_submission_id uuid references public.submissions(id),
 verified_by uuid references public.profiles(id),
 verified_at timestamptz,
 return_reason text,
 updated_at timestamptz not null default now()
);
alter table public.announcement_compliances enable row level security;
grant select on public.announcement_compliances to authenticated;
create policy compliance_read on public.announcement_compliances for select to authenticated
 using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status='active'
 and (p.role in ('main_admin','backup_admin') or p.id=submitted_by or p.school_id=school_id)));
insert into public.announcement_compliances(assignment_id,school_id,compliance_number,submitted_by,submitted_at,status,current_submission_id,verified_by,verified_at)
select distinct on(sub.assignment_id) sub.assignment_id,coalesce(aa.school_id,sub.representing_school_id),
'SRII-SUB-'||to_char(sub.first_received_at at time zone 'Asia/Manila','YYYY')||'-'||lpad(nextval('public.i_track_compliance_seq')::text,6,'0'),
sub.submitted_by,sub.first_received_at,
case sub.verification_status when 'verified' then 'verified' when 'rejected' then 'returned' else 'pending_verification' end,
sub.id,sub.verified_by,sub.verified_at
from public.submissions sub join public.announcement_assignments aa on aa.id=sub.assignment_id
where sub.storage_status in ('uploaded','archived')
order by sub.assignment_id,sub.version_number desc,sub.first_received_at desc
on conflict(assignment_id) do nothing;
alter table public.division_transmittal_items add column if not exists compliance_id uuid references public.announcement_compliances(id);
alter table public.division_transmittal_items drop constraint if exists exactly_one_source;
alter table public.division_transmittal_items add constraint exactly_one_source check(num_nonnulls(document_id,submission_id,compliance_id)=1);
alter table public.division_transmittals add column if not exists signer_name text not null default 'SHERILL E. CORTEJO, PhD';
alter table public.division_transmittals add column if not exists signer_position text not null default 'School Principal II';
alter table public.division_transmittals add column if not exists signer_office text not null default 'OIC, Office of the Public Schools District Supervisor';
alter table public.division_transmittals add column if not exists authorized_school_name text;
