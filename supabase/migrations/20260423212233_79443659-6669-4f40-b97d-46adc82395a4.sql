
-- Create public storage bucket for story covers
INSERT INTO storage.buckets (id, name, public)
VALUES ('story-covers', 'story-covers', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access
CREATE POLICY "Story covers are publicly viewable"
ON storage.objects FOR SELECT
USING (bucket_id = 'story-covers');

-- Service role uploads (used by our generation script via service key)
CREATE POLICY "Service role can manage story covers"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'story-covers');

CREATE POLICY "Service role can update story covers"
ON storage.objects FOR UPDATE
USING (bucket_id = 'story-covers');
