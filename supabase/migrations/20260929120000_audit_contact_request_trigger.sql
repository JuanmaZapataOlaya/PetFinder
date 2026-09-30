-- Los usuarios autenticados ya no pueden insertar en audit_logs; la solicitud
-- de contacto se audita desde un trigger con el esquema actual de la tabla.
create or replace function public.audit_contact_request_sent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (
    new.sender_user_id,
    'CONTACT_REQUEST_SENT',
    'app_notification',
    new.id::text,
    to_jsonb(new)
  );
  return new;
end;
$$;

drop trigger if exists app_notifications_audit_insert on public.app_notifications;
create trigger app_notifications_audit_insert
after insert on public.app_notifications
for each row execute function public.audit_contact_request_sent();
