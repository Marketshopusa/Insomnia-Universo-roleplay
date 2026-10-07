-- Covers can be still images, animated GIFs, or MP4 videos up to 50 MiB.
UPDATE storage.buckets
SET file_size_limit = 52428800
WHERE id = 'user-story-covers';
