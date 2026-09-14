BEGIN;

ALTER TABLE public.app_notifications
	ADD COLUMN IF NOT EXISTS agent_report TEXT,
	ADD COLUMN IF NOT EXISTS agent_steps JSONB;

COMMENT ON COLUMN public.app_notifications.agent_report IS
	'Reporte legible generado al validar las imágenes de evidencia.';
COMMENT ON COLUMN public.app_notifications.agent_steps IS
	'Auditoría completa de pasos y herramientas usados por el agente de validación.';

COMMIT;
