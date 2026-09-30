alter table public.pet_tickets
  add column if not exists resolved_at timestamptz;

create or replace function public.set_pet_ticket_resolved_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'Resuelta' and old.status <> 'Resuelta' then
    new.resolved_at = now();
  elsif new.status = 'Activa' then
    new.resolved_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists pet_tickets_set_resolved_at on public.pet_tickets;
create trigger pet_tickets_set_resolved_at
before update of status on public.pet_tickets
for each row execute function public.set_pet_ticket_resolved_at();

do $$
begin
  alter table public.pet_tickets disable trigger pet_tickets_set_updated_at;
  update public.pet_tickets
  set resolved_at = updated_at
  where status = 'Resuelta' and resolved_at is null;
  alter table public.pet_tickets enable trigger pet_tickets_set_updated_at;
exception when undefined_object then
  update public.pet_tickets
  set resolved_at = updated_at
  where status = 'Resuelta' and resolved_at is null;
end;
$$;

create index if not exists pet_tickets_resolved_at_idx on public.pet_tickets (resolved_at);