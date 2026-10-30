-- ==============================================================================
-- PLANTILLA MAESTRA SQL PARA SUPABASE — BLINDAJE RLS & CONTROL DE TOKENS (CISO)
-- Compatible con: Insomnia Universo Roleplay & Market Clone
-- Ejecutar directamente en: Supabase SQL Editor
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TABLA: public.profiles (Actualización y Extensión con Restricción Anti-Negativo)
-- ------------------------------------------------------------------------------
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'free',
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
ADD COLUMN IF NOT EXISTS ai_credits INTEGER DEFAULT 100;

-- Sincronizar credits y ai_credits para compatibilidad total
UPDATE public.profiles
SET ai_credits = COALESCE(credits, 100)
WHERE ai_credits IS NULL;

-- Restricción estricta de base de datos: Cero créditos negativos jamás
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_profiles_credits_non_negative'
  ) THEN
    ALTER TABLE public.profiles 
    ADD CONSTRAINT check_profiles_credits_non_negative CHECK (credits >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_profiles_ai_credits_non_negative'
  ) THEN
    ALTER TABLE public.profiles 
    ADD CONSTRAINT check_profiles_ai_credits_non_negative CHECK (ai_credits >= 0);
  END IF;
END $$;

-- Habilitar RLS al 100%
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para profiles
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update safe profile fields" ON public.profiles;
CREATE POLICY "Users can update safe profile fields"
ON public.profiles FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Blindaje: Prohibido a clientes modificar saldos, niveles o permisos directamente
REVOKE UPDATE (credits, ai_credits, role, tier, is_admin) ON public.profiles FROM authenticated, anon;
GRANT UPDATE (username, avatar_url, updated_at) ON public.profiles TO authenticated;

-- ------------------------------------------------------------------------------
-- 2. TABLA: public.user_generations (Auditoría Inmutable de Inferencia y GPU)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_generations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    generation_type TEXT NOT NULL, -- 'story_chat', 'illustrate_scene', 'speech_tts', 'kineva_video', 'reel_4k', 'novel'
    credits_deducted INTEGER NOT NULL CHECK (credits_deducted >= 0),
    status TEXT DEFAULT 'completed',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_generations_user_created 
ON public.user_generations (user_id, created_at DESC);

ALTER TABLE public.user_generations ENABLE ROW LEVEL SECURITY;

-- Los usuarios solo pueden auditar y leer sus propias generaciones
DROP POLICY IF EXISTS "Users can view their own generations" ON public.user_generations;
CREATE POLICY "Users can view their own generations"
ON public.user_generations FOR SELECT
USING (auth.uid() = user_id);

-- Solo funciones transaccionales con SECURITY DEFINER o service_role pueden insertar
REVOKE INSERT, UPDATE, DELETE ON public.user_generations FROM authenticated, anon;

-- ------------------------------------------------------------------------------
-- 3. TABLA: public.billing_transactions (Historial de Pagos con Idempotencia)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    stripe_event_id TEXT UNIQUE NOT NULL,
    stripe_customer_id TEXT,
    amount_cents INTEGER NOT NULL DEFAULT 0,
    currency TEXT DEFAULT 'usd',
    credits_added INTEGER NOT NULL DEFAULT 0,
    plan_tier TEXT DEFAULT 'premium',
    status TEXT DEFAULT 'succeeded',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_billing_transactions_user 
ON public.billing_transactions (user_id, created_at DESC);

ALTER TABLE public.billing_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own billing history" ON public.billing_transactions;
CREATE POLICY "Users can view their own billing history"
ON public.billing_transactions FOR SELECT
USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE ON public.billing_transactions FROM authenticated, anon;

-- ------------------------------------------------------------------------------
-- 4. FUNCIÓN TRANSACCIONAL ATÓMICA ANTI-FDOS: deduct_ai_credits
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deduct_ai_credits(
    p_user_id UUID,
    p_amount INTEGER,
    p_generation_type TEXT DEFAULT 'inference',
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
    success BOOLEAN,
    credits_remaining INTEGER,
    error_message TEXT
) AS $$
DECLARE
    v_profile RECORD;
    v_current_credits INTEGER;
    v_new_credits INTEGER;
BEGIN
    -- Validar importe solicitado
    IF p_amount < 0 THEN
        RETURN QUERY SELECT false, 0, 'El monto a deducir no puede ser negativo.'::TEXT;
        RETURN;
    END IF;

    -- Bloqueo pesimista FOR UPDATE para eliminar condiciones de carrera (Race Conditions)
    SELECT * INTO v_profile
    FROM public.profiles
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 0, 'Perfil de usuario no encontrado.'::TEXT;
        RETURN;
    END IF;

    -- Master Admin Bypass (marketshopusafl@gmail.com o is_admin = true)
    IF v_profile.is_admin = true OR v_profile.role = 'admin' THEN
        -- Registrar la auditoría igualmente a coste cero para control de inferencia
        INSERT INTO public.user_generations (user_id, generation_type, credits_deducted, status, metadata)
        VALUES (p_user_id, p_generation_type, 0, 'admin_bypass', p_metadata);

        RETURN QUERY SELECT true, 999999, NULL::TEXT;
        RETURN;
    END IF;

    -- Tomar el saldo actual (compatible con credits y ai_credits)
    v_current_credits := COALESCE(v_profile.ai_credits, v_profile.credits, 0);

    -- Verificar si el saldo es suficiente
    IF v_current_credits < p_amount THEN
        RETURN QUERY SELECT false, v_current_credits, 'Saldo insuficiente para procesar la petición de IA.'::TEXT;
        RETURN;
    END IF;

    -- Descontar créditos en una única transacción atómica
    v_new_credits := v_current_credits - p_amount;

    UPDATE public.profiles
    SET credits = v_new_credits,
        ai_credits = v_new_credits,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- Registrar evento en auditoría inmutable
    INSERT INTO public.user_generations (user_id, generation_type, credits_deducted, status, metadata)
    VALUES (p_user_id, p_generation_type, p_amount, 'completed', p_metadata);

    RETURN QUERY SELECT true, v_new_credits, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Wrapper de retrocompatibilidad: deduct_user_credits
CREATE OR REPLACE FUNCTION public.deduct_user_credits(
    p_user_id UUID,
    p_amount INTEGER,
    p_action TEXT DEFAULT 'generic_action'
)
RETURNS JSONB AS $$
DECLARE
    v_res RECORD;
BEGIN
    SELECT * INTO v_res FROM public.deduct_ai_credits(p_user_id, p_amount, p_action, '{}'::jsonb);
    RETURN jsonb_build_object(
        'success', v_res.success,
        'credits_remaining', v_res.credits_remaining,
        'cost', p_amount,
        'error', CASE WHEN v_res.success THEN NULL ELSE 'insufficient_credits' END,
        'message', v_res.error_message
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 5. TRIGGER AUTOMÁTICO: handle_new_user (Bienvenida con Créditos Iniciales)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    v_is_master_admin BOOLEAN := false;
    v_initial_credits INTEGER := 100;
    v_user_role TEXT := 'user';
BEGIN
    IF LOWER(NEW.email) = 'marketshopusafl@gmail.com' THEN
        v_is_master_admin := true;
        v_initial_credits := 999999;
        v_user_role := 'admin';
    END IF;

    INSERT INTO public.profiles (
        user_id,
        username,
        credits,
        ai_credits,
        role,
        tier,
        is_admin,
        created_at,
        updated_at
    )
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
        v_initial_credits,
        v_initial_credits,
        v_user_role,
        CASE WHEN v_is_master_admin THEN 'pro' ELSE 'free' END,
        v_is_master_admin,
        NOW(),
        NOW()
    )
    ON CONFLICT (user_id) DO UPDATE
    SET role = CASE WHEN v_is_master_admin THEN 'admin' ELSE profiles.role END,
        is_admin = CASE WHEN v_is_master_admin THEN true ELSE profiles.is_admin END,
        credits = CASE WHEN v_is_master_admin THEN 999999 ELSE profiles.credits END,
        ai_credits = CASE WHEN v_is_master_admin THEN 999999 ELSE profiles.ai_credits END;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------------------------
-- 6. STORAGE SEGURO: Bucket Privado private_ai_assets (TTL 900s)
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('private_ai_assets', 'private_ai_assets', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Users can only access their own private_ai_assets" ON storage.objects;
CREATE POLICY "Users can only access their own private_ai_assets"
ON storage.objects FOR ALL
USING (
    bucket_id = 'private_ai_assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
    bucket_id = 'private_ai_assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Asegurar también kineva-references
INSERT INTO storage.buckets (id, name, public)
VALUES ('kineva-references', 'kineva-references', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Users can only access their own biometric references" ON storage.objects;
CREATE POLICY "Users can only access their own biometric references"
ON storage.objects FOR ALL
USING (
    bucket_id = 'kineva-references'
    AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
    bucket_id = 'kineva-references'
    AND (storage.foldername(name))[1] = auth.uid()::text
);
