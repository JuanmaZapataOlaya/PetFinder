create table if not exists public.user_account_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null check (status in ('active', 'suspended', 'deleted')),
  reason text,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  suspended_at timestamptz,
  deleted_at timestamptz
);

create index if not exists user_account_status_status_idx on public.user_account_status (status);
alter table public.user_account_status enable row level security;

drop policy if exists user_account_status_select_staff on public.user_account_status;
create policy user_account_status_select_staff
  on public.user_account_status
  for select
  to authenticated
  using (public.has_any_role(array['moderator', 'admin', 'superadmin']));

revoke all on table public.user_account_status from anon;
revoke insert, update, delete, truncate on table public.user_account_status from authenticated;
grant select on table public.user_account_status to authenticated;