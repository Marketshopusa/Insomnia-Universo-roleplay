
CREATE TABLE public.story_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  story_id UUID NOT NULL,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  narrative TEXT,
  last_mode TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, story_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_sessions TO authenticated;
GRANT ALL ON public.story_sessions TO service_role;

ALTER TABLE public.story_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own sessions" ON public.story_sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own sessions" ON public.story_sessions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own sessions" ON public.story_sessions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own sessions" ON public.story_sessions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_story_sessions_updated_at
  BEFORE UPDATE ON public.story_sessions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX idx_story_sessions_user_updated ON public.story_sessions(user_id, updated_at DESC);
