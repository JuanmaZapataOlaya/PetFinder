create index if not exists pet_tickets_created_at_idx on public.pet_tickets (created_at);
create index if not exists ownership_claims_created_at_idx on public.ownership_claims (created_at);
create index if not exists ownership_claims_reviewed_at_idx on public.ownership_claims (reviewed_at);
create index if not exists pet_matches_created_at_idx on public.pet_matches (created_at);
create index if not exists app_notifications_created_at_idx on public.app_notifications (created_at);
create index if not exists claim_validation_costs_created_at_idx on public.claim_validation_costs (created_at);
create index if not exists profiles_created_at_idx on public.profiles (created_at);

create or replace view public.admin_model_costs_rows as
select
  'claim_validation:' || c.id::text as source,
  'claim_validation'::text as feature,
  'agente'::text as stage,
  null::text as provider,
  null::text as model,
  coalesce(c.agent_input_tokens, 0)::bigint as input_tokens,
  coalesce(c.agent_output_tokens, 0)::bigint as output_tokens,
  c.agent_cost::numeric as cost_usd,
  c.created_at
from public.claim_validation_costs c
where c.agent_input_tokens is not null
   or c.agent_output_tokens is not null
   or c.agent_cost is not null
union all
select
  'claim_validation:' || c.id::text,
  'claim_validation',
  'guardrail_1',
  null,
  null,
  coalesce(c.guardrail_1_input_tokens, c.guard_input_tokens, 0)::bigint,
  coalesce(c.guardrail_1_output_tokens, c.guard_output_tokens, 0)::bigint,
  coalesce(c.guardrail_1_cost, c.guard_cost)::numeric,
  c.created_at
from public.claim_validation_costs c
union all
select
  'claim_validation:' || c.id::text,
  'claim_validation',
  'guardrail_2',
  null,
  null,
  coalesce(c.guardrail_2_input_tokens, 0)::bigint,
  coalesce(c.guardrail_2_output_tokens, 0)::bigint,
  c.guardrail_2_cost::numeric,
  c.created_at
from public.claim_validation_costs c
union all
select
  'model_usage:' || u.id::text,
  u.feature,
  u.stage,
  u.provider,
  u.model,
  u.input_tokens::bigint,
  u.output_tokens::bigint,
  u.cost_usd,
  u.created_at
from public.model_usage u;

revoke all on public.admin_model_costs_rows from anon, authenticated;

create or replace function public.admin_overview_kpis(p_from timestamptz, p_to timestamptz)
returns table (
  tickets_activos bigint, tickets_resueltos_total bigint, tickets_nuevos bigint,
  tickets_resueltos_periodo bigint, perdidas_activas bigint, encontradas_activas bigint,
  reclamos_pendientes bigint, usuarios_nuevos bigint, reportes_pendientes bigint
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.require_any_role(array['moderator', 'admin', 'superadmin']);
  return query
  select
    count(*) filter (where t.status = 'Activa'),
    count(*) filter (where t.status = 'Resuelta'),
    count(*) filter (where t.created_at >= p_from and t.created_at < p_to),
    count(*) filter (where t.resolved_at >= p_from and t.resolved_at < p_to),
    count(*) filter (where t.status = 'Activa' and t.kind = 'Perdida'),
    count(*) filter (where t.status = 'Activa' and t.kind = 'Encontrada'),
    (select count(*) from public.ownership_claims c where c.status = 'pendiente'),
    (select count(*) from public.profiles p where p.created_at >= p_from and p.created_at < p_to),
    (select count(*) from public.user_reports r where r.status = 'pendiente')
  from public.pet_tickets t;
end;
$$;

create or replace function public.admin_tickets_timeseries(
  p_from timestamptz, p_to timestamptz, p_bucket text default 'day',
  p_type text default null, p_kind text default null
)
returns table (bucket date, kind text, total bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.require_any_role(array['moderator', 'admin', 'superadmin']);
  if p_bucket not in ('day', 'week', 'month') then
    raise exception 'Agrupación inválida: %', p_bucket using errcode = '22023';
  end if;
  return query
  select date_trunc(p_bucket, t.created_at at time zone 'America/Bogota')::date, t.kind, count(*)::bigint
  from public.pet_tickets t
  where t.created_at >= p_from and t.created_at < p_to
    and (p_type is null or t.type = p_type)
    and (p_kind is null or t.kind = p_kind)
  group by 1, 2 order by 1, 2;
end;
$$;

create or replace function public.admin_claims_summary(p_from timestamptz, p_to timestamptz)
returns table (pendientes bigint, aprobadas bigint, rechazadas bigint, tasa_aprobacion numeric, horas_revision_promedio numeric)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.require_any_role(array['moderator', 'admin', 'superadmin']);
  return query
  select
    count(*) filter (where c.status = 'pendiente'),
    count(*) filter (where c.status = 'aprobada' and c.reviewed_at >= p_from and c.reviewed_at < p_to),
    count(*) filter (where c.status = 'rechazada' and c.reviewed_at >= p_from and c.reviewed_at < p_to),
    coalesce(
      count(*) filter (where c.status = 'aprobada' and c.reviewed_at >= p_from and c.reviewed_at < p_to)::numeric
      / nullif(count(*) filter (where c.status in ('aprobada', 'rechazada') and c.reviewed_at >= p_from and c.reviewed_at < p_to), 0), 0
    ),
    coalesce(avg(extract(epoch from (c.reviewed_at - c.created_at)) / 3600)
      filter (where c.reviewed_at >= p_from and c.reviewed_at < p_to), 0)
  from public.ownership_claims c;
end;
$$;

create or replace function public.admin_claims_timeseries(p_from timestamptz, p_to timestamptz, p_bucket text default 'day')
returns table (bucket date, status text, total bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.require_any_role(array['moderator', 'admin', 'superadmin']);
  if p_bucket not in ('day', 'week', 'month') then
    raise exception 'Agrupación inválida: %', p_bucket using errcode = '22023';
  end if;
  return query
  select date_trunc(p_bucket, c.created_at at time zone 'America/Bogota')::date, c.status, count(*)::bigint
  from public.ownership_claims c
  where c.created_at >= p_from and c.created_at < p_to
  group by 1, 2 order by 1, 2;
end;
$$;

create or replace function public.admin_reports_summary(p_from timestamptz, p_to timestamptz)
returns table (pendientes bigint, en_revision bigint, nuevos_periodo bigint, resueltos_periodo bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.require_any_role(array['moderator', 'admin', 'superadmin']);
  return query
  select
    count(*) filter (where r.status = 'pendiente'),
    count(*) filter (where r.status = 'en_revision'),
    count(*) filter (where r.created_at >= p_from and r.created_at < p_to),
    count(*) filter (where r.resolved_at >= p_from and r.resolved_at < p_to)
  from public.user_reports r;
end;
$$;

create or replace function public.admin_reports_timeseries(p_from timestamptz, p_to timestamptz, p_bucket text default 'day')
returns table (bucket date, reason text, total bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.require_any_role(array['moderator', 'admin', 'superadmin']);
  if p_bucket not in ('day', 'week', 'month') then
    raise exception 'Agrupación inválida: %', p_bucket using errcode = '22023';
  end if;
  return query
  select date_trunc(p_bucket, r.created_at at time zone 'America/Bogota')::date, r.reason, count(*)::bigint
  from public.user_reports r
  where r.created_at >= p_from and r.created_at < p_to
  group by 1, 2 order by 1, 2;
end;
$$;

create or replace function public.admin_costs_summary(p_from timestamptz, p_to timestamptz)
returns table (total_usd numeric, llamadas bigint, input_tokens bigint, output_tokens bigint, validaciones_reclamo bigint, costo_promedio_validacion numeric, filas_sin_tarifa bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.require_any_role(array['admin', 'superadmin']);
  return query
  with rows as (
    select * from public.admin_model_costs_rows r where r.created_at >= p_from and r.created_at < p_to
  ), validations as (
    select distinct source, cost_usd from rows where feature = 'claim_validation'
  )
  select
    coalesce(sum(r.cost_usd), 0),
    count(distinct r.source),
    coalesce(sum(r.input_tokens), 0),
    coalesce(sum(r.output_tokens), 0),
    (select count(*) from validations),
    coalesce((select avg(v.cost_usd) from validations v), 0),
    count(*) filter (where r.cost_usd is null)
  from rows r;
end;
$$;

revoke execute on function public.admin_overview_kpis(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_overview_kpis(timestamptz, timestamptz) to authenticated;
revoke execute on function public.admin_tickets_timeseries(timestamptz, timestamptz, text, text, text) from public, anon;
grant execute on function public.admin_tickets_timeseries(timestamptz, timestamptz, text, text, text) to authenticated;
revoke execute on function public.admin_claims_summary(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_claims_summary(timestamptz, timestamptz) to authenticated;
revoke execute on function public.admin_claims_timeseries(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.admin_claims_timeseries(timestamptz, timestamptz, text) to authenticated;
revoke execute on function public.admin_reports_summary(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_reports_summary(timestamptz, timestamptz) to authenticated;
revoke execute on function public.admin_reports_timeseries(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.admin_reports_timeseries(timestamptz, timestamptz, text) to authenticated;
revoke execute on function public.admin_costs_summary(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_costs_summary(timestamptz, timestamptz) to authenticated;