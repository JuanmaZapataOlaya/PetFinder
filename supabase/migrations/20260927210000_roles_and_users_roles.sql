-- =====================================================================
-- Migración: roles y relación users_roles
-- Roles base: user, moderator, admin, superadmin
-- - Todo usuario recibe el rol 'user' al registrarse (trigger en auth.users).
-- - Solo un superadmin asigna o revoca roles, mediante las RPC assign_role / revoke_role.
-- - El cliente no puede escribir directamente en roles ni en users_roles.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Catálogo de roles
-- ---------------------------------------------------------------------
create table if not exists public.roles (
  id          smallint generated always as identity primary key,
  name        text not null unique check (name ~ '^[a-z_]+$'),
  description text,
  created_at  timestamptz not null default now()
);

insert into public.roles (name, description) values
  ('user',       'Usuario estándar de la plataforma'),
  ('moderator',  'Revisa reportes, denuncias y reclamos'),
  ('admin',      'Acceso al panel administrativo completo, excepto gestión de roles y borrado definitivo'),
  ('superadmin', 'Gestiona roles y puede ejecutar el borrado definitivo de usuarios')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- 2. Relación usuario <-> rol (muchos a muchos)
-- ---------------------------------------------------------------------
create table if not exists public.users_roles (
  user_id     uuid        not null references auth.users (id) on delete cascade,
  role_id     smallint    not null references public.roles (id) on delete restrict,
  assigned_by uuid        references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (user_id, role_id)
);

create index if not exists users_roles_role_id_idx on public.users_roles (role_id);

-- ---------------------------------------------------------------------
-- 3. Funciones de consulta de rol (usan auth.uid(), no aceptan otro usuario)
-- security definer: leen users_roles sin pasar por RLS y evitan recursión en políticas.
-- ---------------------------------------------------------------------
create or replace function public.has_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and r.name = p_role
  );
$$;

create or replace function public.has_any_role(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and r.name = any (p_roles)
  );
$$;

-- Lanza 42501 (insufficient_privilege) si el usuario actual no tiene ninguno de los roles.
-- Se usa al inicio de todas las RPC administrativas.
create or replace function public.require_any_role(p_roles text[])
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_any_role(p_roles) then
    raise exception 'Permiso denegado' using errcode = '42501';
  end if;
end;
$$;

-- Roles del usuario autenticado, para el frontend (guard de rutas y menú).
create or replace function public.get_my_roles()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(r.name order by r.id), '{}'::text[])
  from public.users_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- 4. Rol por defecto al registrarse + backfill de usuarios existentes
-- ---------------------------------------------------------------------
create or replace function public.assign_default_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users_roles (user_id, role_id)
  select new.id, r.id
  from public.roles r
  where r.name = 'user'
  on conflict (user_id, role_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_assign_role on auth.users;
create trigger on_auth_user_created_assign_role
  after insert on auth.users
  for each row execute function public.assign_default_role();

insert into public.users_roles (user_id, role_id)
select u.id, r.id
from auth.users u
cross join public.roles r
where r.name = 'user'
on conflict (user_id, role_id) do nothing;

-- ---------------------------------------------------------------------
-- 5. Asignar / revocar roles (solo superadmin)
-- ---------------------------------------------------------------------
create or replace function public.assign_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_id smallint;
begin
  if not public.has_role('superadmin') then
    raise exception 'Solo un superadmin puede asignar roles' using errcode = '42501';
  end if;

  select id into v_role_id from public.roles where name = p_role;
  if v_role_id is null then
    raise exception 'Rol inexistente: %', p_role using errcode = '22023';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Usuario inexistente: %', p_user_id using errcode = '22023';
  end if;

  insert into public.users_roles (user_id, role_id, assigned_by)
  values (p_user_id, v_role_id, auth.uid())
  on conflict (user_id, role_id) do nothing;
end;
$$;

create or replace function public.revoke_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_superadmins integer;
begin
  if not public.has_role('superadmin') then
    raise exception 'Solo un superadmin puede revocar roles' using errcode = '42501';
  end if;

  if p_role = 'user' then
    raise exception 'El rol user es el rol base y no se puede revocar' using errcode = '22023';
  end if;

  if p_role = 'superadmin' then
    -- Bloquea la fila del rol para evitar que dos revocaciones simultáneas dejen el sistema sin superadmin.
    perform 1 from public.roles where name = 'superadmin' for update;

    select count(*) into v_superadmins
    from public.users_roles ur
    join public.roles r on r.id = ur.role_id
    where r.name = 'superadmin';

    if v_superadmins <= 1 and exists (
      select 1
      from public.users_roles ur
      join public.roles r on r.id = ur.role_id
      where r.name = 'superadmin' and ur.user_id = p_user_id
    ) then
      raise exception 'No se puede revocar el último superadmin' using errcode = '22023';
    end if;
  end if;

  delete from public.users_roles ur
  using public.roles r
  where ur.role_id = r.id
    and ur.user_id = p_user_id
    and r.name = p_role;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. RLS y privilegios
-- ---------------------------------------------------------------------
alter table public.roles       enable row level security;
alter table public.users_roles enable row level security;

drop policy if exists "roles_select_authenticated" on public.roles;
create policy "roles_select_authenticated"
  on public.roles
  for select
  to authenticated
  using (true);

-- Cada usuario ve sus propios roles; el staff ve los de todos.
drop policy if exists "users_roles_select_own_or_staff" on public.users_roles;
create policy "users_roles_select_own_or_staff"
  on public.users_roles
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.has_any_role(array['moderator', 'admin', 'superadmin'])
  );

-- Sin políticas de insert/update/delete: las escrituras solo ocurren vía assign_role / revoke_role.
revoke all on table public.roles       from anon;
revoke all on table public.users_roles from anon;
revoke insert, update, delete, truncate on table public.roles       from authenticated;
revoke insert, update, delete, truncate on table public.users_roles from authenticated;

revoke execute on function public.has_role(text)                from public, anon;
revoke execute on function public.has_any_role(text[])          from public, anon;
revoke execute on function public.require_any_role(text[])      from public, anon;
revoke execute on function public.get_my_roles()                from public, anon;
revoke execute on function public.assign_role(uuid, text)       from public, anon;
revoke execute on function public.revoke_role(uuid, text)       from public, anon;
revoke execute on function public.assign_default_role()         from public, anon, authenticated;

grant execute on function public.has_role(text)           to authenticated;
grant execute on function public.has_any_role(text[])     to authenticated;
grant execute on function public.require_any_role(text[]) to authenticated;
grant execute on function public.get_my_roles()           to authenticated;
grant execute on function public.assign_role(uuid, text)  to authenticated;
grant execute on function public.revoke_role(uuid, text)  to authenticated;

-- ---------------------------------------------------------------------
-- 7. Primer superadmin (ejecutar UNA vez, manualmente, en el SQL Editor; no forma parte de la migración)
-- ---------------------------------------------------------------------
-- insert into public.users_roles (user_id, role_id)
-- select u.id, r.id
-- from auth.users u
-- cross join public.roles r
-- where u.email = 'CORREO_DEL_SUPERADMIN'
--   and r.name = 'superadmin'
-- on conflict (user_id, role_id) do nothing;
