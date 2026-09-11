BEGIN;

-- ============================================================
-- EXTENSIONES
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- ESTABLE: necesaria para gen_random_uuid()

-- ============================================================
-- PROFILES
-- Extiende auth.users (gestionado por Supabase Auth) con los datos propios
-- de la app. NO guarda email/password/provider/verified: eso ya vive en
-- auth.users y Supabase Auth lo administra por completo.
-- ============================================================
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, -- ESTABLE: 1:1 con auth.users, el UUID lo genera Supabase Auth al registrar
    name TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
    photo_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Crea automáticamente el profile cuando alguien se registra vía Supabase Auth.
-- PROBABLE CAMBIO: qué metadata lees de raw_user_meta_data depende de qué
-- envíes al hacer signUp() desde el frontend (Vue).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, name, photo_url)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- PET_TICKETS
-- ============================================================
CREATE TABLE pet_tickets (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, -- ESTABLE: ahora lo genera Postgres, el frontend no manda id
    owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
    type TEXT NOT NULL CHECK (type IN ('Perro', 'Gato', 'Ave', 'Otro')), -- PROBABLE CAMBIO: lista de especies puede crecer
    kind TEXT NOT NULL CHECK (kind IN ('Perdida', 'Encontrada')), -- ESTABLE: es la distinción central del negocio
    status TEXT NOT NULL DEFAULT 'Activa' CHECK (status IN ('Activa', 'Resuelta')), -- PROBABLE CAMBIO: quizá necesites 'Falso positivo' o 'Pausada' más adelante
    location TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90), -- ESTABLE
    longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180), -- ESTABLE
    image TEXT NOT NULL, -- ESTABLE: URL/path en Storage, foto principal
    color TEXT NOT NULL,
    breed TEXT NOT NULL,
    note TEXT NOT NULL,

    -- PROBABLE CAMBIO / A ELIMINAR: un solo score en el ticket no puede representar que un mismo
    -- reporte tenga varios candidatos de match simultáneos (ver tabla pet_matches). Se deja aquí
    -- solo por compatibilidad con el frontend actual.
    match_score SMALLINT NOT NULL DEFAULT 0 CHECK (match_score BETWEEN 0 AND 100),

    reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX pet_tickets_owner_id_idx ON pet_tickets (owner_id);
CREATE INDEX pet_tickets_status_idx ON pet_tickets (status);
CREATE INDEX pet_tickets_location_idx ON pet_tickets (latitude, longitude);

-- ============================================================
-- PET_MATCHES
-- ============================================================
CREATE TABLE pet_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- ESTABLE
    lost_ticket_id BIGINT NOT NULL REFERENCES pet_tickets(id) ON DELETE CASCADE,
    found_ticket_id BIGINT NOT NULL REFERENCES pet_tickets(id) ON DELETE CASCADE,
    similarity_score REAL NOT NULL CHECK (similarity_score BETWEEN 0 AND 1), -- ESTABLE: score normalizado 0-1
    status TEXT NOT NULL DEFAULT 'sugerido' CHECK (status IN ('sugerido', 'confirmado', 'descartado')), -- PROBABLE CAMBIO: podrías añadir 'expirado'
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    CHECK (lost_ticket_id <> found_ticket_id),
    UNIQUE (lost_ticket_id, found_ticket_id)
);

CREATE INDEX pet_matches_lost_idx ON pet_matches (lost_ticket_id);
CREATE INDEX pet_matches_found_idx ON pet_matches (found_ticket_id);
CREATE INDEX pet_matches_status_idx ON pet_matches (status);

-- ============================================================
-- OWNERSHIP_CLAIMS
-- ============================================================
CREATE TABLE ownership_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- ESTABLE
    ticket_id BIGINT NOT NULL REFERENCES pet_tickets(id) ON DELETE CASCADE,
    claimant_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    evidence_image TEXT NOT NULL, -- ESTABLE: URL/path en Storage de la foto de soporte
    similarity_score REAL CHECK (similarity_score IS NULL OR similarity_score BETWEEN 0 AND 1),
    status TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'aprobada', 'rechazada')), -- PROBABLE CAMBIO: podrías separar 'en_revision' de 'pendiente'
    reviewed_by UUID REFERENCES profiles(id), -- ESTABLE: null si aún no hay revisor
    reviewer_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at TIMESTAMPTZ
);

CREATE INDEX ownership_claims_ticket_idx ON ownership_claims (ticket_id);
CREATE INDEX ownership_claims_claimant_idx ON ownership_claims (claimant_user_id);
CREATE INDEX ownership_claims_status_idx ON ownership_claims (status);

-- ============================================================
-- CONTACT_INFOS
-- ============================================================
CREATE TABLE contact_infos (
    user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE, -- ESTABLE
    full_name TEXT,
    age SMALLINT CHECK (age IS NULL OR age BETWEEN 0 AND 150),
    latitude DOUBLE PRECISION CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
    address TEXT,
    phone_number TEXT,
    email TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- USER_SESSIONS: ELIMINADA.
-- Supabase Auth gestiona sesiones y tokens (JWT) internamente en su propio
-- esquema; mantener esta tabla sería duplicar responsabilidad y quedaría
-- desincronizada con lo que Supabase realmente usa para autenticar.
-- ============================================================

-- ============================================================
-- APP_NOTIFICATIONS
-- PROBABLE CAMBIO: el CHECK de 'type' debe ampliarse si agregas más eventos.
-- ============================================================
CREATE TABLE app_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- ESTABLE
    recipient_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    sender_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE, -- nullable: MATCH_SUGGESTED lo genera el sistema, sin sender humano
    report_id BIGINT NOT NULL REFERENCES pet_tickets(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN (
        'CONTACT_REQUEST',
        'MATCH_SUGGESTED',
        'CLAIM_SUBMITTED',
        'CLAIM_APPROVED',
        'CLAIM_REJECTED'
    )),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    sender_name TEXT,
    sender_phone TEXT,
    sender_email TEXT,
    pet_image TEXT,
    evidence_images JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    read BOOLEAN NOT NULL DEFAULT FALSE,
    CHECK (sender_user_id IS NULL OR recipient_user_id <> sender_user_id)
);

CREATE INDEX app_notifications_recipient_created_idx
    ON app_notifications (recipient_user_id, created_at DESC);
CREATE INDEX app_notifications_report_sender_created_idx
    ON app_notifications (report_id, sender_user_id, created_at DESC);

-- ============================================================
-- AUDIT_LOGS
-- ============================================================
CREATE TABLE audit_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, -- ESTABLE
    action TEXT NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_action_created_idx ON audit_logs (action, created_at DESC);

-- ============================================================
-- TRIGGERS DE updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_set_updated_at
BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER pet_tickets_set_updated_at
BEFORE UPDATE ON pet_tickets
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- RLS: el frontend usa la anon key y nunca debe confiarse en ella
-- para autorizar operaciones. Las políticas se basan en auth.uid().
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pet_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_infos ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_read_authenticated ON profiles
FOR SELECT TO authenticated USING (true);
CREATE POLICY profiles_update_own ON profiles
FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY tickets_read_authenticated ON pet_tickets
FOR SELECT TO authenticated USING (true);
CREATE POLICY tickets_insert_own ON pet_tickets
FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY tickets_update_own ON pet_tickets
FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY tickets_delete_own ON pet_tickets
FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE POLICY contacts_read_authenticated ON contact_infos
FOR SELECT TO authenticated USING (true);
CREATE POLICY contacts_insert_own ON contact_infos
FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY contacts_update_own ON contact_infos
FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY notifications_read_own ON app_notifications
FOR SELECT TO authenticated USING (recipient_user_id = auth.uid());
CREATE POLICY notifications_insert_sender ON app_notifications
FOR INSERT TO authenticated WITH CHECK (sender_user_id = auth.uid());
CREATE POLICY notifications_update_own ON app_notifications
FOR UPDATE TO authenticated USING (recipient_user_id = auth.uid()) WITH CHECK (recipient_user_id = auth.uid());
CREATE POLICY notifications_delete_own ON app_notifications
FOR DELETE TO authenticated USING (recipient_user_id = auth.uid());

CREATE POLICY audit_insert_authenticated ON audit_logs
FOR INSERT TO authenticated WITH CHECK (true);

-- Las imágenes se almacenan en Storage; la tabla solo conserva su URL pública.
INSERT INTO storage.buckets (id, name, public)
VALUES ('pet-images', 'pet-images', TRUE)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY pet_images_insert_own ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'pet-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY pet_images_update_own ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'pet-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY pet_images_delete_own ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'pet-images' AND (storage.foldername(name))[1] = auth.uid()::text);

COMMIT;