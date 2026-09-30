create or replace function public.admin_claims_dashboard(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform public.require_any_role(array['moderator', 'admin', 'superadmin']);

  select jsonb_build_object(
    'ticketStatus', coalesce((
      select jsonb_agg(jsonb_build_object('label', grouped.status, 'total', grouped.total) order by grouped.status)
      from (select t.status, count(*)::bigint as total from public.pet_tickets t group by t.status) grouped
    ), '[]'::jsonb),
    'ticketTimeline', coalesce((
      select jsonb_agg(jsonb_build_object('bucket', timeline.bucket, 'kind', timeline.kind, 'created', timeline.created, 'resolved', timeline.resolved)
        order by timeline.bucket, timeline.kind)
      from (
        select events.bucket, events.kind, sum(events.created)::bigint as created, sum(events.resolved)::bigint as resolved
        from (
          select date_trunc('day', t.created_at at time zone 'America/Bogota')::date::text as bucket, t.kind,
            count(*)::bigint as created, 0::bigint as resolved
          from public.pet_tickets t
          where t.created_at >= p_from and t.created_at < p_to
          group by 1, 2
          union all
          select date_trunc('day', t.resolved_at at time zone 'America/Bogota')::date::text, t.kind,
            0::bigint, count(*)::bigint
          from public.pet_tickets t
          where t.resolved_at >= p_from and t.resolved_at < p_to
          group by 1, 2
        ) events
        group by events.bucket, events.kind
      ) timeline
    ), '[]'::jsonb),
    'locationStats', coalesce((
      select jsonb_agg(jsonb_build_object('label', grouped.label, 'kind', grouped.kind, 'total', grouped.total) order by grouped.total desc)
      from (
        select coalesce(nullif(trim(t.location), ''), 'Sin ubicación') as label, t.kind, count(*)::bigint as total
        from public.pet_tickets t
        where t.created_at >= p_from and t.created_at < p_to
        group by 1, t.kind
        order by count(*) desc
        limit 30
      ) grouped
    ), '[]'::jsonb),
    'speciesStats', coalesce((
      select jsonb_agg(jsonb_build_object('label', grouped.label, 'kind', grouped.kind, 'total', grouped.total) order by grouped.total desc)
      from (
        select t.type as label, t.kind, count(*)::bigint as total
        from public.pet_tickets t
        where t.created_at >= p_from and t.created_at < p_to
        group by t.type, t.kind
      ) grouped
    ), '[]'::jsonb),
    'breedStats', coalesce((
      select jsonb_agg(jsonb_build_object('label', grouped.label, 'kind', grouped.kind, 'total', grouped.total) order by grouped.total desc)
      from (
        select coalesce(nullif(trim(t.breed), ''), 'Sin raza especificada') as label, t.kind, count(*)::bigint as total
        from public.pet_tickets t
        where t.created_at >= p_from and t.created_at < p_to
        group by 1, t.kind
        order by count(*) desc
        limit 30
      ) grouped
    ), '[]'::jsonb),
    'claimStatus', coalesce((
      select jsonb_agg(jsonb_build_object('label', grouped.status, 'total', grouped.total) order by grouped.status)
      from (
        select c.status, count(*)::bigint as total
        from public.ownership_claims c
        where c.created_at >= p_from and c.created_at < p_to
        group by c.status
      ) grouped
    ), '[]'::jsonb),
    'claims', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'status', c.status,
        'created_at', c.created_at,
        'reviewed_at', c.reviewed_at,
        'evidence_image', c.evidence_image,
        'similarity_score', c.similarity_score,
        'ticket_id', t.id,
        'ticket_name', t.name,
        'ticket_type', t.type,
        'ticket_kind', t.kind,
        'ticket_status', t.status,
        'ticket_location', t.location,
        'claimant_id', c.claimant_user_id,
        'claimant_name', claimant.name
      ) order by c.created_at desc)
      from public.ownership_claims c
      join public.pet_tickets t on t.id = c.ticket_id
      left join public.profiles claimant on claimant.id = c.claimant_user_id
      where c.created_at >= p_from and c.created_at < p_to
    ), '[]'::jsonb),
    'notificationReads', coalesce((
      select jsonb_agg(jsonb_build_object('label', grouped.label, 'total', grouped.total) order by grouped.label)
      from (
        select case when n.read then 'Vistas' else 'Sin ver' end as label, count(*)::bigint as total
        from public.app_notifications n
        where n.created_at >= p_from and n.created_at < p_to
        group by 1
      ) grouped
    ), '[]'::jsonb),
    'totals', jsonb_build_object(
      'tickets', (select count(*)::bigint from public.pet_tickets t where t.created_at >= p_from and t.created_at < p_to),
      'claims', (select count(*)::bigint from public.ownership_claims c where c.created_at >= p_from and c.created_at < p_to),
      'openClaims', (select count(*)::bigint from public.ownership_claims c where c.status = 'pendiente'),
      'notificationsRead', (select count(*)::bigint from public.app_notifications n where n.created_at >= p_from and n.created_at < p_to and n.read),
      'notificationsUnread', (select count(*)::bigint from public.app_notifications n where n.created_at >= p_from and n.created_at < p_to and not n.read)
    )
  ) into result;
  return result;
end;
$$;

create or replace function public.admin_reports_dashboard(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform public.require_any_role(array['moderator', 'admin', 'superadmin']);

  select jsonb_build_object(
    'statuses', coalesce((
      select jsonb_agg(jsonb_build_object('label', grouped.status, 'total', grouped.total) order by grouped.status)
      from (
        select r.status, count(*)::bigint as total
        from public.user_reports r
        where r.created_at >= p_from and r.created_at < p_to
        group by r.status
      ) grouped
    ), '[]'::jsonb),
    'reasons', coalesce((
      select jsonb_agg(jsonb_build_object('label', grouped.reason, 'total', grouped.total) order by grouped.total desc)
      from (
        select r.reason, count(*)::bigint as total
        from public.user_reports r
        where r.created_at >= p_from and r.created_at < p_to
        group by r.reason
      ) grouped
    ), '[]'::jsonb),
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'reason', r.reason,
        'description', r.description,
        'evidence_images', to_jsonb(r.evidence_images),
        'status', r.status,
        'reviewer_notes', r.reviewer_notes,
        'created_at', r.created_at,
        'resolved_at', r.resolved_at,
        'reporter_id', r.reporter_user_id,
        'reporter_name', reporter.name,
        'reported_user_id', r.reported_user_id,
        'reported_user_name', reported.name,
        'ticket_id', t.id,
        'ticket_name', t.name,
        'ticket_kind', t.kind,
        'ticket_type', t.type,
        'ticket_breed', t.breed,
        'ticket_color', t.color,
        'ticket_status', t.status,
        'ticket_location', t.location,
        'ticket_image', t.image
      ) order by r.created_at desc)
      from public.user_reports r
      left join public.profiles reporter on reporter.id = r.reporter_user_id
      left join public.profiles reported on reported.id = r.reported_user_id
      left join public.pet_tickets t on t.id = r.ticket_id
      where r.created_at >= p_from and r.created_at < p_to
    ), '[]'::jsonb),
    'total', (
      select count(*)::bigint
      from public.user_reports r
      where r.created_at >= p_from and r.created_at < p_to
    )
  ) into result;
  return result;
end;
$$;

create or replace function public.admin_costs_dashboard(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform public.require_any_role(array['admin', 'superadmin']);

  select jsonb_build_object(
    'modelCosts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'source', r.source,
        'feature', r.feature,
        'stage', r.stage,
        'provider', r.provider,
        'model', r.model,
        'input_tokens', r.input_tokens,
        'output_tokens', r.output_tokens,
        'cost_usd', r.cost_usd,
        'created_at', r.created_at
      ) order by r.created_at desc)
      from public.admin_model_costs_rows r
      where r.created_at >= p_from and r.created_at < p_to
    ), '[]'::jsonb),
    'claimValidationCosts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'notification_id', c.notification_id,
        'guard_input_tokens', c.guard_input_tokens,
        'guard_output_tokens', c.guard_output_tokens,
        'guard_cost', c.guard_cost,
        'guardrail_1_input_tokens', c.guardrail_1_input_tokens,
        'guardrail_1_output_tokens', c.guardrail_1_output_tokens,
        'guardrail_1_cost', c.guardrail_1_cost,
        'guardrail_2_input_tokens', c.guardrail_2_input_tokens,
        'guardrail_2_output_tokens', c.guardrail_2_output_tokens,
        'guardrail_2_cost', c.guardrail_2_cost,
        'agent_input_tokens', c.agent_input_tokens,
        'agent_output_tokens', c.agent_output_tokens,
        'agent_cost', c.agent_cost,
        'created_at', c.created_at
      ) order by c.created_at desc)
      from public.claim_validation_costs c
      where c.created_at >= p_from and c.created_at < p_to
    ), '[]'::jsonb),
    'summary', jsonb_build_object(
      'totalUsd', coalesce((select sum(r.cost_usd) from public.admin_model_costs_rows r where r.created_at >= p_from and r.created_at < p_to), 0),
      'modelRows', (select count(*)::bigint from public.admin_model_costs_rows r where r.created_at >= p_from and r.created_at < p_to),
      'claimValidations', (select count(*)::bigint from public.claim_validation_costs c where c.created_at >= p_from and c.created_at < p_to),
      'claimUsd', coalesce((select sum(coalesce(c.guardrail_1_cost, c.guard_cost, 0) + coalesce(c.guardrail_2_cost, 0) + coalesce(c.agent_cost, 0)) from public.claim_validation_costs c where c.created_at >= p_from and c.created_at < p_to), 0)
    )
  ) into result;
  return result;
end;
$$;

create or replace function public.admin_users_page(p_limit integer default 100, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform public.require_any_role(array['admin', 'superadmin']);
  if p_limit < 1 or p_limit > 200 or p_offset < 0 then
    raise exception 'Paginación inválida.' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'total', (select count(*)::bigint from public.profiles),
    'users', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'photo_url', p.photo_url,
        'created_at', p.created_at,
        'email', u.email,
        'contact', (select to_jsonb(ci) - 'user_id' from public.contact_infos ci where ci.user_id = p.id),
        'roles', coalesce((
          select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name) order by r.id)
          from public.users_roles ur
          join public.roles r on r.id = ur.role_id
          where ur.user_id = p.id
        ), '[]'::jsonb)
      ) order by p.created_at desc)
      from (
        select profiles.* from public.profiles
        order by profiles.created_at desc
        limit p_limit offset p_offset
      ) p
      left join auth.users u on u.id = p.id
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_is_superadmin boolean;
begin
  if not public.has_any_role(array['admin', 'superadmin']) then
    raise exception 'Permiso denegado.' using errcode = '42501';
  end if;
  if p_user_id is null or p_user_id = auth.uid() then
    raise exception 'No puedes eliminar tu propia cuenta.' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'El usuario seleccionado ya no existe.' using errcode = 'P0002';
  end if;

  select exists (
    select 1 from public.users_roles ur join public.roles r on r.id = ur.role_id
    where ur.user_id = p_user_id and r.name = 'superadmin'
  ) into target_is_superadmin;

  if target_is_superadmin and not public.has_role('superadmin') then
    raise exception 'Solo un superadministrador puede eliminar a otro superadministrador.' using errcode = '42501';
  end if;
  if target_is_superadmin and (
    select count(*) from public.users_roles ur join public.roles r on r.id = ur.role_id where r.name = 'superadmin'
  ) <= 1 then
    raise exception 'No se puede eliminar al último superadministrador.' using errcode = '22023';
  end if;

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'user_deleted', 'user', p_user_id::text, jsonb_build_object('permanent', true));

  delete from auth.users where id = p_user_id;
end;
$$;

revoke all on function public.admin_claims_dashboard(timestamptz, timestamptz) from public, anon;
revoke all on function public.admin_reports_dashboard(timestamptz, timestamptz) from public, anon;
revoke all on function public.admin_costs_dashboard(timestamptz, timestamptz) from public, anon;
revoke all on function public.admin_users_page(integer, integer) from public, anon;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_claims_dashboard(timestamptz, timestamptz) to authenticated;
grant execute on function public.admin_reports_dashboard(timestamptz, timestamptz) to authenticated;
grant execute on function public.admin_costs_dashboard(timestamptz, timestamptz) to authenticated;
grant execute on function public.admin_users_page(integer, integer) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
