-- A chapter can contain several timed shots; publish only after all latest takes assemble.
ALTER TABLE public.kineva_render_jobs
  ADD COLUMN spoken_script TEXT;

ALTER TABLE public.shorts_episodes
  ADD COLUMN kineva_shot_count INTEGER CHECK (kineva_shot_count BETWEEN 1 AND 12),
  ADD COLUMN kineva_assembly_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN kineva_assembly_started_at TIMESTAMPTZ;

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
    SET status = 'failed',
        error_message = 'worker lease expired after three attempts'
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
       OR jsonb_array_length(p_manifest->'qc'->'issues') <> 0
       OR (p_manifest->'qc'->>'audio_present') IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Invalid output path or QC report';
    END IF;
    UPDATE public.kineva_render_jobs
      SET status = 'ready', output_path = p_output_path, manifest = p_manifest,
          lease_token = NULL, lease_until = NULL
      WHERE id = job.id;
  ELSE
    UPDATE public.kineva_render_jobs
      SET status = 'failed', error_message = left(coalesce(p_error, 'render failed'), 500),
          lease_token = NULL, lease_until = NULL
      WHERE id = job.id;
    UPDATE public.shorts_episodes
      SET status = 'failed', error_message = left(coalesce(p_error, 'render failed'), 500)
      WHERE id = job.episode_id;
  END IF;
  RETURN TRUE;
END; $$;

CREATE OR REPLACE FUNCTION public.claim_kineva_assembly(p_episode_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ep public.shorts_episodes; count_shots INTEGER; ready_shots BOOLEAN;
  paths JSONB; next_version INTEGER;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required';
  END IF;
  SELECT * INTO ep FROM public.shorts_episodes WHERE id = p_episode_id FOR UPDATE;
  IF NOT FOUND OR ep.kineva_shot_count IS NULL
     OR ep.status NOT IN ('generating', 'assembling') THEN RETURN NULL; END IF;
  IF ep.status = 'assembling'
     AND ep.kineva_assembly_started_at > now() - interval '2 hours' THEN
    RETURN NULL;
  END IF;
  WITH latest AS (
    SELECT DISTINCT ON (shot) shot, status, output_path
      FROM public.kineva_render_jobs
      WHERE episode_id = p_episode_id ORDER BY shot, take DESC
  )
  SELECT count(*)::INTEGER, coalesce(bool_and(status = 'ready'), FALSE),
         jsonb_agg(output_path ORDER BY shot)
    INTO count_shots, ready_shots, paths FROM latest;
  IF count_shots <> ep.kineva_shot_count OR NOT ready_shots THEN RETURN NULL; END IF;
  next_version := ep.kineva_assembly_version + 1;
  UPDATE public.shorts_episodes
    SET status = 'assembling', kineva_assembly_version = next_version,
        kineva_assembly_started_at = now(), error_message = NULL
    WHERE id = p_episode_id;
  RETURN jsonb_build_object('episode_id', p_episode_id,
    'version', next_version, 'paths', paths);
END; $$;
REVOKE ALL ON FUNCTION public.claim_kineva_assembly(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_kineva_assembly(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_kineva_assembly(
  p_episode_id UUID, p_version INTEGER, p_success BOOLEAN,
  p_output_path TEXT DEFAULT NULL, p_error TEXT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ep public.shorts_episodes;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required';
  END IF;
  SELECT * INTO ep FROM public.shorts_episodes
    WHERE id = p_episode_id AND status = 'assembling'
      AND kineva_assembly_version = p_version FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF p_success THEN
    IF p_output_path IS DISTINCT FROM
        ('episodes/' || p_episode_id || '/kineva/assembly_v' || p_version || '.mp4') THEN
      RAISE EXCEPTION 'Invalid assembly output path';
    END IF;
    UPDATE public.shorts_episodes
      SET status = 'ready', video_url = p_output_path,
          job_id = 'kineva:assembly:' || p_version, error_message = NULL,
          kineva_assembly_started_at = NULL WHERE id = p_episode_id;
  ELSE
    UPDATE public.shorts_episodes
      SET status = 'failed', error_message = left(coalesce(p_error, 'assembly failed'), 500),
          kineva_assembly_started_at = NULL WHERE id = p_episode_id;
  END IF;
  RETURN TRUE;
END; $$;
REVOKE ALL ON FUNCTION public.finish_kineva_assembly(UUID, INTEGER, BOOLEAN, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_kineva_assembly(UUID, INTEGER, BOOLEAN, TEXT, TEXT)
  TO service_role;


-- Only the owner may publish after every episode has a completed montage.
CREATE OR REPLACE FUNCTION public.publish_kineva_series(p_series_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner UUID; provider TEXT;
BEGIN
  SELECT created_by, video_provider INTO owner, provider
    FROM public.shorts_series WHERE id = p_series_id FOR UPDATE;
  IF NOT FOUND OR owner IS DISTINCT FROM auth.uid() OR provider <> 'kineva' THEN
    RAISE EXCEPTION 'Not the Kineva series owner';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.shorts_episodes WHERE series_id = p_series_id)
     OR EXISTS (SELECT 1 FROM public.shorts_episodes
                WHERE series_id = p_series_id
                  AND (status <> 'ready' OR video_url IS NULL
                       OR job_id NOT LIKE 'kineva:assembly:%')) THEN
    RAISE EXCEPTION 'All episodes must have completed montages';
  END IF;
  UPDATE public.shorts_series SET is_published = TRUE WHERE id = p_series_id;
  RETURN TRUE;
END; $$;
REVOKE ALL ON FUNCTION public.publish_kineva_series(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_kineva_series(UUID) TO authenticated;
