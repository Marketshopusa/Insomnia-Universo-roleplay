CREATE POLICY "Public read story gallery"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'story-gallery');