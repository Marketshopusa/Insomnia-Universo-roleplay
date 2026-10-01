-- Kineva local still images for roleplay scenes and novel chapters.
CREATE TABLE IF NOT EXISTS public.kineva_scene_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('story', 'novel')),
  scene_key text NOT NULL CHECK (char_length(scene_key) BETWEEN 1 AND 120),
  reference_url text,
  prompt text NOT NULL CHECK (char_length(prompt) BETWEEN 8 AND 8000),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'ready', 'failed')),
  output_path text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  CONSTRAINT kineva_scene_ready_image CHECK (status <> 'ready' OR output_path IS NOT NULL)
);
ALTER TABLE public.kineva_scene_jobs ADD COLUMN IF NOT EXISTS reference_url text;
CREATE INDEX IF NOT EXISTS kineva_scene_jobs_queue ON public.kineva_scene_jobs (created_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS kineva_scene_jobs_owner ON public.kineva_scene_jobs (owner_id, created_at DESC);
ALTER TABLE public.kineva_scene_jobs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.kineva_scene_jobs TO authenticated;
GRANT ALL ON public.kineva_scene_jobs TO service_role;
DROP POLICY IF EXISTS "kineva scene owner read" ON public.kineva_scene_jobs;
CREATE POLICY "kineva scene owner read" ON public.kineva_scene_jobs
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
DROP POLICY IF EXISTS "kineva scene owner enqueue" ON public.kineva_scene_jobs;
CREATE POLICY "kineva scene owner enqueue" ON public.kineva_scene_jobs
  FOR INSERT TO authenticated WITH CHECK (
    owner_id = auth.uid() AND status = 'queued'
    AND output_path IS NULL AND error_message IS NULL
    AND started_at IS NULL AND finished_at IS NULL
  );
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('kineva-scene-images', 'kineva-scene-images', false, 10485760, ARRAY['image/png'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/png'];
DROP POLICY IF EXISTS "kineva scene owner view" ON storage.objects;
CREATE POLICY "kineva scene owner view" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'kineva-scene-images'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

-- Atomic claim permits a single local worker and safe restart after a stale run.
CREATE OR REPLACE FUNCTION public.claim_kineva_scene_job()
RETURNS SETOF public.kineva_scene_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH next_job AS (
    SELECT id FROM public.kineva_scene_jobs
    WHERE status = 'queued'
       OR (status = 'running' AND started_at < now() - interval '15 minutes')
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.kineva_scene_jobs AS job
  SET status = 'running', started_at = now(), updated_at = now(),
      error_message = NULL
  FROM next_job WHERE job.id = next_job.id
  RETURNING job.*;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_kineva_scene_job() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_kineva_scene_job() TO service_role;
