-- Dashboard aggregates are exposed through this role-checked function, not direct table access.
create or replace function public.admin_dashboard_metrics(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  dashboard jsonb;
begin
  if not exists (
    select 1
    from public.users_roles ur
    where ur.user_id = auth.uid()
      and ur.role_id >= 3
  ) then
    raise exception 'Acceso No Autorizado' using errcode = '42501';
  end if;

  if p_from is null or p_to is null or p_from >= p_to then
    raise exception 'El periodo de consulta no es válido.' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'modelCosts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'bucket', costs.bucket,
        'provider', costs.provider,
        'model', costs.model,
        'amount', costs.amount
      ) order by costs.bucket, costs.provider, costs.model)
      from (
        select
          date_trunc('day', r.created_at at time zone 'America/Bogota')::date::text as bucket,
          coalesce(r.provider, 'Validación de reclamo') as provider,
          coalesce(r.model, r.stage, 'Servicio') as model,
          sum(r.cost_usd)::numeric as amount
        from public.admin_model_costs_rows r
        where r.created_at >= p_from
          and r.created_at < p_to
          and r.cost_usd is not null
        group by 1, 2, 3
      ) costs
    ), '[]'::jsonb),
    'notificationStatuses', coalesce((
      select jsonb_agg(jsonb_build_object('label', statuses.label, 'total', statuses.total) order by statuses.label)
      from (
        select case when n.read then 'Leídas' else 'Sin leer' end as label, count(*)::bigint as total
        from public.app_notifications n
        where n.created_at >= p_from and n.created_at < p_to
        group by 1
      ) statuses
    ), '[]'::jsonb),
    'notificationsByType', coalesce((
      select jsonb_agg(jsonb_build_object('label', types.label, 'total', types.total) order by types.label)
      from (
        select n.type as label, count(*)::bigint as total
        from public.app_notifications n
        where n.created_at >= p_from and n.created_at < p_to
        group by n.type
      ) types
    ), '[]'::jsonb),
    'claimCosts', coalesce((
      select jsonb_agg(jsonb_build_object('label', claims.label, 'amount', claims.amount) order by claims.label)
      from (
        select coalesce(n.type, 'Sin solicitud asociada') as label,
          sum(coalesce(c.guardrail_1_cost, c.guard_cost, 0)
            + coalesce(c.guardrail_2_cost, 0)
            + coalesce(c.agent_cost, 0))::numeric as amount
        from public.claim_validation_costs c
        left join public.app_notifications n on n.id = c.notification_id
        where c.created_at >= p_from and c.created_at < p_to
        group by 1
      ) claims
    ), '[]'::jsonb),
    'ticketTimeseries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'bucket', activity.bucket,
        'kind', activity.kind,
        'created', activity.created,
        'resolved', activity.resolved
      ) order by activity.bucket, activity.kind)
      from (
        select events.bucket, events.kind, sum(events.created)::bigint as created, sum(events.resolved)::bigint as resolved
        from (
          select
            date_trunc('day', t.created_at at time zone 'America/Bogota')::date::text as bucket,
            t.kind,
            count(*)::bigint as created,
            0::bigint as resolved
          from public.pet_tickets t
          where t.created_at >= p_from and t.created_at < p_to
          group by 1, 2
          union all
          select
            date_trunc('day', t.resolved_at at time zone 'America/Bogota')::date::text as bucket,
            t.kind,
            0::bigint as created,
            count(*)::bigint as resolved
          from public.pet_tickets t
          where t.resolved_at >= p_from and t.resolved_at < p_to
          group by 1, 2
        ) events
        group by events.bucket, events.kind
      ) activity
    ), '[]'::jsonb),
    'ticketBreakdown', coalesce((
      select jsonb_agg(jsonb_build_object(
        'category', breakdown.category,
        'status', breakdown.status,
        'total', breakdown.total
      ) order by breakdown.category, breakdown.status)
      from (
        select t.type as category, t.status, count(*)::bigint as total
        from public.pet_tickets t
        group by t.type, t.status
      ) breakdown
    ), '[]'::jsonb),
    'ticketKpis', jsonb_build_object(
      'created', (select count(*)::bigint from public.pet_tickets t where t.created_at >= p_from and t.created_at < p_to),
      'resolved', (select count(*)::bigint from public.pet_tickets t where t.resolved_at >= p_from and t.resolved_at < p_to),
      'open', (select count(*)::bigint from public.pet_tickets t where t.status = 'Activa'),
      'closed', (select count(*)::bigint from public.pet_tickets t where t.status = 'Resuelta')
    )
  ) into dashboard;

  return dashboard;
end;
$$;

revoke all on function public.admin_dashboard_metrics(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_dashboard_metrics(timestamptz, timestamptz) to authenticated;
