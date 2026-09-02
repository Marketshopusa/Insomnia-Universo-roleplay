CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE IF NOT EXISTS public.shorts_series (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  premise TEXT,
  category TEXT NOT NULL DEFAULT 'romance',
  is_adult BOOLEAN NOT NULL DEFAULT false,
  cover_url TEXT,
  created_by UUID,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shorts_episodes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  series_id UUID NOT NULL REFERENCES public.shorts_series(id) ON DELETE CASCADE,
  episode_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  script TEXT NOT NULL,
  video_prompt TEXT,
  video_url TEXT,
  poster_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  job_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (series_id, episode_number)
);

CREATE INDEX IF NOT EXISTS idx_shorts_episodes_series ON public.shorts_episodes(series_id, episode_number);

GRANT SELECT ON public.shorts_series TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shorts_series TO authenticated;
GRANT ALL ON public.shorts_series TO service_role;

GRANT SELECT ON public.shorts_episodes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shorts_episodes TO authenticated;
GRANT ALL ON public.shorts_episodes TO service_role;

ALTER TABLE public.shorts_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shorts_episodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view published series" ON public.shorts_series FOR SELECT USING (is_published = true OR created_by = auth.uid());
CREATE POLICY "Users can create series" ON public.shorts_series FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Creators can update their series" ON public.shorts_series FOR UPDATE TO authenticated USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
CREATE POLICY "Creators can delete their series" ON public.shorts_series FOR DELETE TO authenticated USING (created_by = auth.uid());

CREATE POLICY "Anyone can view episodes of visible series" ON public.shorts_episodes FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.shorts_series s WHERE s.id = series_id AND (s.is_published = true OR s.created_by = auth.uid()))
);
CREATE POLICY "Creators can manage their episodes" ON public.shorts_episodes FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.shorts_series s WHERE s.id = series_id AND s.created_by = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.shorts_series s WHERE s.id = series_id AND s.created_by = auth.uid())
);

CREATE TRIGGER update_shorts_series_updated_at BEFORE UPDATE ON public.shorts_series FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER update_shorts_episodes_updated_at BEFORE UPDATE ON public.shorts_episodes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();