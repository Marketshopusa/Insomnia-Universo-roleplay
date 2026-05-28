
ALTER TABLE public.user_stories
  ADD COLUMN IF NOT EXISTS cover_media_url text,
  ADD COLUMN IF NOT EXISTS cover_media_type text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('user-story-covers', 'user-story-covers', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "User story covers are publicly viewable"
ON storage.objects FOR SELECT
USING (bucket_id = 'user-story-covers');

CREATE POLICY "Users upload own story covers"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'user-story-covers'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users update own story covers"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'user-story-covers'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users delete own story covers"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'user-story-covers'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
