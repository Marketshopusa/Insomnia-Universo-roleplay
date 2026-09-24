-- Kineva jobs are private. Only the local worker with a service-role key can claim or finish them.
ALTER TABLE public.shorts_series
  ADD COLUMN IF NOT EXISTS kineva_bible JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.shorts_series
  ADD COLUMN IF NOT EXISTS video_provider TEXT NOT NULL DEFAULT 'gateway'
    CHECK (video_provider IN ('gateway', 'kineva'));
ALTER TABLE public.shorts_series
  ADD COLUMN IF NOT EXISTS kineva_reference_image_path TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('kineva-references', 'kineva-references', false, 10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Owners upload Kineva references" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'kineva-references'
    AND split_part(name, '/', 1) = auth.uid()::text);
CREATE POLICY "Owners read Kineva references" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'kineva-references'
    AND split_part(name, '/', 1) = auth.uid()::text);
CREATE POLICY "Owners delete Kineva references" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'kineva-references'
    AND split_part(name, '/', 1) = auth.uid()::text);

CREATE TABLE public.kineva_render_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES public.shorts_episodes(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  profile TEXT NOT NULL CHECK (profile IN ('MINISERIES', 'TALKING_PRESENTER')),
  prompt TEXT NOT NULL,
  bible JSONB NOT NULL DEFAULT '{}'::jsonb,
  reference_image_path TEXT,
  shot INTEGER NOT NULL DEFAULT 1 CHECK (shot > 0),
  take INTEGER NOT NULL DEFAULT 1 CHECK (take > 0),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'ready', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_token UUID,
  lease_until TIMESTAMPTZ,
  output_path TEXT,
  manifest JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (episode_id, shot, take)
);
CREATE INDEX kineva_jobs_queue_idx ON public.kineva_render_jobs(created_at)
  WHERE status IN ('queued', 'running');
CREATE INDEX kineva_jobs_episode_idx ON public.kineva_render_jobs(episode_id, created_at DESC);
ALTER TABLE public.kineva_render_jobs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.kineva_render_jobs TO authenticated;
GRANT ALL ON public.kineva_render_jobs TO service_role;
CREATE POLICY "Creators see their own Kineva jobs"
  ON public.kineva_render_jobs FOR SELECT TO authenticated
  USING (owner_id = auth.uid());
CREATE TRIGGER kineva_jobs_updated_at BEFORE UPDATE ON public.kineva_render_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.claim_kineva_job()
RETURNS SETOF public.kineva_render_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE picked public.kineva_render_jobs;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required';
  END IF;
  WITH exhausted AS (
    UPDATE public.kineva_render_jobs
      SET status = 'failed', lease_token = NULL, lease_until = NULL,
          error_message = 'worker lease expired after three attempts'
      WHERE status = 'running' AND lease_until < now() AND attempts >= 3
      RETURNING episode_id
  )
  UPDATE public.shorts_episodes e
    SET status = CASE WHEN e.video_url IS NULL THEN 'failed' ELSE 'ready' END,
        error_message = CASE WHEN e.video_url IS NULL
          THEN 'worker lease expired after three attempts' ELSE NULL END
    WHERE e.id IN (SELECT episode_id FROM exhausted);
  SELECT * INTO picked FROM public.kineva_render_jobs
    WHERE (status = 'queued' OR (status = 'running' AND lease_until < now()))
      AND attempts < 3
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE public.kineva_render_jobs
    SET status = 'running', attempts = attempts + 1,
        lease_token = gen_random_uuid(), lease_until = now() + interval '2 hours',
        error_message = NULL
    WHERE id = picked.id RETURNING * INTO picked;
  RETURN NEXT picked;
END; $$;
REVOKE ALL ON FUNCTION public.claim_kineva_job() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_kineva_job() TO service_role;

CREATE OR REPLACE FUNCTION public.finish_kineva_job(
  p_job_id UUID, p_lease_token UUID, p_success BOOLEAN,
  p_output_path TEXT DEFAULT NULL, p_manifest JSONB DEFAULT NULL,
  p_error TEXT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE job public.kineva_render_jobs;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required';
  END IF;
  SELECT * INTO job FROM public.kineva_render_jobs
    WHERE id = p_job_id AND lease_token = p_lease_token
      AND status = 'running' AND lease_until > now()
    FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF p_success THEN
    IF p_output_path IS DISTINCT FROM
        ('episodes/' || job.episode_id || '/kineva/' || job.id || '.mp4')
       OR p_manifest IS NULL
       OR jsonb_typeof(p_manifest->'qc'->'issues') IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_manifest->'qc'->'issues') <> 0 THEN
      RAISE EXCEPTION 'Invalid output path or QC report';
    END IF;
    UPDATE public.kineva_render_jobs
      SET status = 'ready', output_path = p_output_path, manifest = p_manifest,
          lease_token = NULL, lease_until = NULL
      WHERE id = job.id;
    UPDATE public.shorts_episodes
      SET video_url = p_output_path, status = 'ready',
          error_message = NULL, job_id = ('kineva:' || job.id)
      WHERE id = job.episode_id;
  ELSE
    UPDATE public.kineva_render_jobs
      SET status = 'failed', error_message = left(coalesce(p_error, 'render failed'), 500),
          lease_token = NULL, lease_until = NULL
      WHERE id = job.id;
    UPDATE public.shorts_episodes
      SET status = CASE WHEN video_url IS NULL THEN 'failed' ELSE 'ready' END,
          error_message = CASE WHEN video_url IS NULL THEN left(coalesce(p_error, 'render failed'), 500)
            ELSE NULL END
      WHERE id = job.episode_id;
  END IF;
  RETURN TRUE;
END; $$;
REVOKE ALL ON FUNCTION public.finish_kineva_job(UUID, UUID, BOOLEAN, TEXT, JSONB, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_kineva_job(UUID, UUID, BOOLEAN, TEXT, JSONB, TEXT)
  TO service_role;
