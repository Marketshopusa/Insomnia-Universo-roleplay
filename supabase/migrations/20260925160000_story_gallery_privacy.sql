-- Keep the public story gallery readable only for ready images attached to a story.
-- The original bucket is private; its former SELECT policy exposed every object.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('story-gallery', 'story-gallery', false, 10485760)
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = 10485760;

CREATE INDEX IF NOT EXISTS story_images_ready_storage_path_idx
  ON public.story_images (storage_path)
  WHERE status = 'ready' AND storage_path IS NOT NULL;

GRANT SELECT ON public.stories, public.story_images TO anon, authenticated;

DROP POLICY IF EXISTS "Public read story gallery" ON storage.objects;
DROP POLICY IF EXISTS "Ready story gallery images are viewable" ON storage.objects;
CREATE POLICY "Ready story gallery images are viewable"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'story-gallery'
    AND EXISTS (
      SELECT 1 FROM public.story_images AS image
      JOIN public.stories AS story ON story.id = image.story_id
      WHERE image.storage_path = storage.objects.name
        AND image.status = 'ready'
        AND split_part(storage.objects.name, '/', 1) = 'stories'
        AND split_part(storage.objects.name, '/', 2) = story.id::text
    )
  );
