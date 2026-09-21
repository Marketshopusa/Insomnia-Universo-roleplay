CREATE TABLE public.story_images (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  image_url text,
  storage_path text,
  task_id text,
  visual_prompt text,
  sort_order integer not null default 0,
  status text not null default 'pending',
  error_message text,
  created_at timestamptz not null default now()
);

GRANT SELECT ON public.story_images TO anon, authenticated;
GRANT ALL ON public.story_images TO service_role;

ALTER TABLE public.story_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Story images are publicly viewable"
  ON public.story_images FOR SELECT
  TO public
  USING (true);

CREATE INDEX idx_story_images_story ON public.story_images (story_id, sort_order);