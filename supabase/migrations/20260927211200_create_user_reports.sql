create table if not exists public.user_reports (
  id bigint generated always as identity primary key,
  reporter_user_id uuid references public.profiles(id) on delete set null,
  reported_user_id uuid references public.profiles(id) on delete set null,
  ticket_id bigint references public.pet_tickets(id) on delete set null,
  reason text not null check (reason in ('fraude', 'suplantacion', 'spam', 'contenido_inapropiado', 'otro')),
  description text,
  evidence_images text[] not null default '{}',
  status text not null default 'pendiente' check (status in ('pendiente', 'en_revision', 'resuelto', 'descartado')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewer_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create or replace function public.populate_reported_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.ticket_id is not null and new.reported_user_id is null then
    select t.owner_id into new.reported_user_id
    from public.pet_tickets t
    where t.id = new.ticket_id;
  end if;
  return new;
end;
$$;

drop trigger if exists user_reports_populate_reported_user on public.user_reports;
create trigger user_reports_populate_reported_user
before insert on public.user_reports
for each row execute function public.populate_reported_user();

drop trigger if exists user_reports_set_updated_at on public.user_reports;
create trigger user_reports_set_updated_at
before update on public.user_reports
for each row execute function public.set_updated_at();

create unique index if not exists user_reports_open_reporter_target_idx
  on public.user_reports (reporter_user_id, reported_user_id)
  where status in ('pendiente', 'en_revision');
create index if not exists user_reports_created_at_idx on public.user_reports (created_at desc);
create index if not exists user_reports_status_idx on public.user_reports (status);
create index if not exists user_reports_reported_user_idx on public.user_reports (reported_user_id);

alter table public.user_reports enable row level security;
drop policy if exists user_reports_insert_authenticated on public.user_reports;
create policy user_reports_insert_authenticated
  on public.user_reports
  for insert
  to authenticated
  with check (
    reporter_user_id = auth.uid()
    and status = 'pendiente'
    and reviewed_by is null
    and reported_user_id is distinct from auth.uid()
    and (reported_user_id is not null or ticket_id is not null)
  );

drop policy if exists user_reports_select_own_or_staff on public.user_reports;
create policy user_reports_select_own_or_staff
  on public.user_reports
  for select
  to authenticated
  using (
    reporter_user_id = auth.uid()
    or public.has_any_role(array['moderator', 'admin', 'superadmin'])
  );

revoke all on table public.user_reports from anon;
revoke update, delete, truncate on table public.user_reports from authenticated;
grant select, insert on table public.user_reports to authenticated;