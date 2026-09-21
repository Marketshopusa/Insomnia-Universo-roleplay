CREATE TABLE public.story_customizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  cover_media_url text,
  cover_media_type text,
  voice text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, story_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_customizations TO authenticated;
GRANT ALL ON public.story_customizations TO service_role;

ALTER TABLE public.story_customizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own story customizations"
ON public.story_customizations FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_story_customizations_updated_at
BEFORE UPDATE ON public.story_customizations
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();