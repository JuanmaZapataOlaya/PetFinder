BEGIN;

ALTER TABLE public.app_notifications
  ADD COLUMN IF NOT EXISTS evidence_images JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.validate_notification_evidence(images JSONB)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT jsonb_typeof(images) = 'array'
    AND jsonb_array_length(images) = 2
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(images) AS item
      WHERE jsonb_typeof(item) <> 'object'
        OR NULLIF(item->>'url', '') IS NULL
        OR NULLIF(item->>'path', '') IS NULL
        OR item->>'content_type' NOT IN ('image/jpeg', 'image/png', 'image/webp')
    );
$$;

CREATE OR REPLACE FUNCTION public.require_contact_notification_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.type = 'CONTACT_REQUEST'
     AND NOT public.validate_notification_evidence(NEW.evidence_images) THEN
    RAISE EXCEPTION 'Las solicitudes de contacto requieren exactamente 2 imágenes JPG, JPEG, PNG o WEBP válidas.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS app_notifications_require_evidence ON public.app_notifications;
CREATE TRIGGER app_notifications_require_evidence
BEFORE INSERT OR UPDATE OF type, evidence_images ON public.app_notifications
FOR EACH ROW
EXECUTE FUNCTION public.require_contact_notification_evidence();

COMMENT ON COLUMN public.app_notifications.evidence_images IS
  'Dos referencias JSON a imágenes de evidencia: url, path y content_type.';

COMMIT;
