-- ====================================================================
-- MIGRATION: Robust Security, Atomic Credit Deductions & Concurrency Limits
-- Insomnia Universo Roleplay — Enterprise Architecture Hardening
-- ====================================================================

-- 1. Table: Active AI Concurrency Locks
CREATE TABLE IF NOT EXISTS public.active_ai_locks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    action TEXT NOT NULL,
    plan_tier TEXT DEFAULT 'free',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '3 minutes') NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_active_ai_locks_user_expires 
ON public.active_ai_locks (user_id, expires_at);

ALTER TABLE public.active_ai_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view and manage their own locks"
ON public.active_ai_locks FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 2. Table: Stripe Webhook Idempotency & Audit Log
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
    id TEXT PRIMARY KEY, -- Stripe event.id (e.g. evt_123456789)
    event_type TEXT NOT NULL,
    customer_id TEXT,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    payload JSONB
);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin only read on stripe events"
ON public.stripe_webhook_events FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.user_id = auth.uid() 
    AND (profiles.is_admin = true OR profiles.role = 'admin')
  )
);

-- 3. Atomic RPC Function: Deduct User Credits
-- Ensures thread-safe credit deduction using SELECT ... FOR UPDATE
CREATE OR REPLACE FUNCTION public.deduct_user_credits(
    p_user_id UUID,
    p_amount INTEGER,
    p_action TEXT DEFAULT 'generic_action'
)
RETURNS JSONB AS $$
DECLARE
    v_profile RECORD;
    v_new_credits INTEGER;
BEGIN
    -- Check if user is an admin; admins never pay credits
    SELECT * INTO v_profile
    FROM public.profiles
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'profile_not_found',
            'message', 'Perfil de usuario no encontrado.'
        );
    END IF;

    IF v_profile.is_admin = true OR v_profile.role = 'admin' THEN
        RETURN jsonb_build_object(
            'success', true,
            'is_admin', true,
            'cost', 0,
            'credits_remaining', 999999
        );
    END IF;

    IF COALESCE(v_profile.credits, 0) < p_amount THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'insufficient_credits',
            'credits_remaining', COALESCE(v_profile.credits, 0),
            'cost', p_amount,
            'message', 'Créditos insuficientes.'
        );
    END IF;

    v_new_credits := v_profile.credits - p_amount;

    UPDATE public.profiles
    SET credits = v_new_credits,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'cost', p_amount,
        'credits_remaining', v_new_credits
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Biometric Storage Protection: kineva-references & scene images
-- Ensure buckets exist and RLS strictly isolates files by user UUID folder
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


-- 5. Strict Protection of Financial and Administrative Columns
-- Prevent direct client modification of credits, roles, or admin flags via Supabase SDK
REVOKE UPDATE (credits, role, is_admin) ON public.profiles FROM authenticated, anon;

-- Grant column update permissions only for safe profile fields
GRANT UPDATE (username, avatar_url, updated_at) ON public.profiles TO authenticated;
