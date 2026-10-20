-- Migration: Configure marketshopusafl@gmail.com as Insomnia Universo Master Administrator

-- 1. Ensure role and is_admin columns exist on profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user',
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- 2. Function to auto-grant admin status to marketshopusafl@gmail.com
CREATE OR REPLACE FUNCTION public.handle_admin_user_role()
RETURNS trigger AS $$
BEGIN
  IF LOWER(NEW.email) = 'marketshopusafl@gmail.com' THEN
    UPDATE public.profiles
    SET role = 'admin',
        is_admin = true,
        credits = 999999
    WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Trigger on auth.users for registration/login
DROP TRIGGER IF EXISTS on_auth_user_admin_check ON auth.users;
CREATE TRIGGER on_auth_user_admin_check
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_admin_user_role();

-- 4. Retroactively update existing profile for marketshopusafl@gmail.com if already created
DO $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE LOWER(email) = 'marketshopusafl@gmail.com' LIMIT 1;
  IF v_user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET role = 'admin',
        is_admin = true,
        credits = 999999
    WHERE user_id = v_user_id;
  END IF;
END $$;
