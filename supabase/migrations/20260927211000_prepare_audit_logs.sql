-- Normaliza la tabla de auditoria existente sin perder sus registros.
alter table public.audit_logs
  add column if not exists actor_user_id uuid,
  add column if not exists target_type text,
  add column if not exists target_id text,
  add column if not exists metadata jsonb;

update public.audit_logs
set target_type = coalesce(target_type, 'legacy'),
    metadata = coalesce(metadata, data, '{}'::jsonb)
where target_type is null or metadata is null;

alter table public.audit_logs
  alter column target_type set default 'legacy',
  alter column target_type set not null,
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null;

alter table public.audit_logs drop column if exists data;

create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_target_idx on public.audit_logs (target_type, target_id);

alter table public.audit_logs enable row level security;
drop policy if exists audit_insert_authenticated on public.audit_logs;
drop policy if exists audit_logs_select_admin on public.audit_logs;
create policy audit_logs_select_admin
  on public.audit_logs
  for select
  to authenticated
  using (public.has_any_role(array['admin', 'superadmin']));

revoke all on table public.audit_logs from anon;
revoke insert, update, delete, truncate on table public.audit_logs from authenticated;
grant select on table public.audit_logs to authenticated;

create or replace function public.audit_user_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  role_name text;
  changed_user_id uuid;
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  changed_user_id := case when tg_op = 'INSERT' then new.user_id else old.user_id end;
  select r.name into role_name
  from public.roles r
  where r.id = case when tg_op = 'INSERT' then new.role_id else old.role_id end;

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (
    auth.uid(),
    case when tg_op = 'INSERT' then 'role_assigned' else 'role_revoked' end,
    'user',
    changed_user_id::text,
    jsonb_build_object('role', role_name)
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists users_roles_audit_insert on public.users_roles;
create trigger users_roles_audit_insert
after insert on public.users_roles
for each row execute function public.audit_user_role_change();

drop trigger if exists users_roles_audit_delete on public.users_roles;
create trigger users_roles_audit_delete
after delete on public.users_roles
for each row execute function public.audit_user_role_change();