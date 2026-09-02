REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated;

CREATE POLICY "Public read shorts media" ON storage.objects FOR SELECT USING (bucket_id = 'shorts-media');
CREATE POLICY "Service can write shorts media" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'shorts-media');