CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE public.pet_tickets
ADD COLUMN IF NOT EXISTS fts_embedding vector(1536);

CREATE OR REPLACE FUNCTION public.invoke_embed_mascota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://mpgugycsjnkwmzdzmnmu.supabase.co/functions/v1/embed-mascota',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object(
      'record', to_jsonb(NEW),
      'type', TG_OP
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pet_tickets_embed_mascota ON public.pet_tickets;

CREATE TRIGGER pet_tickets_embed_mascota
AFTER INSERT OR UPDATE OF name, type, breed, color, note, location ON public.pet_tickets
FOR EACH ROW
EXECUTE FUNCTION public.invoke_embed_mascota();
