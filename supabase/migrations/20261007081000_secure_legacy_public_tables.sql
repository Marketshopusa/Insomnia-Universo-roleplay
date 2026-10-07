-- Legacy tables are not used by the current Insomnia client. Keep service_role
-- access for maintenance while denying anonymous and authenticated API access.
-- Policies can be introduced per table when a client feature is implemented.
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audio_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.series ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.images ENABLE ROW LEVEL SECURITY;
