-- Make the media bucket reproducible for a new Insomnia project and keep drafts private.
INSERT INTO storage.buckets (id, name, public)
VALUES ('shorts-media', 'shorts-media', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Public read shorts media" ON storage.objects;
CREATE POLICY "Read visible Shorts episode video"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'shorts-media'
    AND EXISTS (
      SELECT 1
      FROM public.shorts_episodes e
      JOIN public.shorts_series s ON s.id = e.series_id
      WHERE e.video_url = storage.objects.name
        AND (s.is_published OR s.created_by = auth.uid())
    )
  );
