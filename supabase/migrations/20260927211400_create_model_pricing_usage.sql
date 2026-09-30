create table if not exists public.model_pricing (
  id bigint generated always as identity primary key,
  provider text not null,
  model text not null,
  input_usd_per_1m numeric(14, 6) not null,
  output_usd_per_1m numeric(14, 6) not null default 0,
  effective_from timestamptz not null,
  effective_to timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (provider, model, effective_from)
);

create table if not exists public.model_usage (
  id bigint generated always as identity primary key,
  provider text not null,
  model text not null,
  feature text not null,
  stage text,
  user_id uuid references public.profiles(id) on delete set null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cost_usd numeric(14, 8),
  pricing_id bigint references public.model_pricing(id),
  request_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists model_pricing_model_idx on public.model_pricing (provider, model, effective_from desc);
create index if not exists model_usage_created_at_idx on public.model_usage (created_at desc);
create index if not exists model_usage_feature_idx on public.model_usage (feature, created_at desc);

create or replace function public.calculate_model_usage_cost()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pricing_row public.model_pricing%rowtype;
begin
  if new.cost_usd is not null then
    return new;
  end if;

  select * into pricing_row
  from public.model_pricing p
  where p.provider = new.provider
    and p.model = new.model
    and p.effective_from <= new.created_at
    and (p.effective_to is null or new.created_at < p.effective_to)
  order by p.effective_from desc
  limit 1;

  if pricing_row.id is not null then
    new.pricing_id = pricing_row.id;
    new.cost_usd = (new.input_tokens::numeric / 1000000 * pricing_row.input_usd_per_1m)
      + (new.output_tokens::numeric / 1000000 * pricing_row.output_usd_per_1m);
  end if;
  return new;
end;
$$;

drop trigger if exists model_usage_calculate_cost on public.model_usage;
create trigger model_usage_calculate_cost
before insert on public.model_usage
for each row execute function public.calculate_model_usage_cost();

alter table public.model_pricing enable row level security;
alter table public.model_usage enable row level security;
drop policy if exists model_pricing_select_staff on public.model_pricing;
create policy model_pricing_select_staff
  on public.model_pricing for select to authenticated
  using (public.has_any_role(array['admin', 'superadmin']));
drop policy if exists model_usage_select_staff on public.model_usage;
create policy model_usage_select_staff
  on public.model_usage for select to authenticated
  using (public.has_any_role(array['admin', 'superadmin']));

revoke all on table public.model_pricing, public.model_usage from anon;
revoke insert, update, delete, truncate on table public.model_pricing, public.model_usage from authenticated;
grant select on table public.model_pricing, public.model_usage to authenticated;

-- Cargar tarifas oficiales antes de registrar consumos:
-- ('@google-gemini', 'gemini-3.1-flash-lite', TODO, TODO)
-- ('@google-gemini', 'gemini-3.5-flash-lite', TODO, TODO)
-- ('@azure-openai', 'text-embedding-3-small', TODO, 0)