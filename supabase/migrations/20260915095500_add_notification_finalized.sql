BEGIN;

ALTER TABLE public.app_notifications
ADD COLUMN IF NOT EXISTS finalizado BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS app_notifications_finalizado_idx
ON public.app_notifications (recipient_user_id, finalizado, created_at DESC);

COMMENT ON COLUMN public.app_notifications.finalizado IS
'Indica si el destinatario marco el reporte como finalizado.';

COMMIT;
