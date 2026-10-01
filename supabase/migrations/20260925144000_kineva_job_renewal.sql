-- Keep a claimed job alive while ComfyUI renders a long shot.
-- A matching lease token can recover after the workstation resumes from sleep,
-- provided another worker has not already reclaimed the job.
CREATE OR REPLACE FUNCTION public.renew_kineva_job(
  p_job_id UUID, p_lease_token UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required';
  END IF;
  UPDATE public.kineva_render_jobs
    SET lease_until = now() + interval '2 hours'
    WHERE id = p_job_id AND lease_token = p_lease_token
      AND status = 'running';
  RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION public.renew_kineva_job(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renew_kineva_job(UUID, UUID)
  TO service_role;
