-- Append-only, authenticated session writes with optimistic concurrency.
-- Existing messages and row-level policies remain intact; no memory expiration.
ALTER TABLE public.story_sessions ADD COLUMN IF NOT EXISTS memory_revision bigint NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION public.advance_story_memory_revision()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $body$
BEGIN
  NEW.memory_revision := OLD.memory_revision + 1;
  RETURN NEW;
END;
$body$;
DROP TRIGGER IF EXISTS trg_story_memory_revision ON public.story_sessions;
CREATE TRIGGER trg_story_memory_revision BEFORE UPDATE ON public.story_sessions
FOR EACH ROW EXECUTE FUNCTION public.advance_story_memory_revision();

-- Deletion markers contain only IDs, never conversation content.
-- They prevent a first write whose acknowledgement was lost from reviving deleted history.
CREATE TABLE IF NOT EXISTS public.story_session_deletions (
  user_id uuid NOT NULL, story_id uuid NOT NULL, session_id uuid PRIMARY KEY,
  deleted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.story_session_deletions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own deletion markers" ON public.story_session_deletions;
CREATE POLICY "Users view own deletion markers" ON public.story_session_deletions
FOR SELECT TO authenticated USING (auth.uid() = user_id);
REVOKE ALL ON public.story_session_deletions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.story_session_deletions FROM authenticated;
GRANT SELECT ON public.story_session_deletions TO authenticated;
CREATE OR REPLACE FUNCTION public.record_story_session_deletion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $body$
BEGIN
  INSERT INTO public.story_session_deletions(user_id, story_id, session_id)
    VALUES (OLD.user_id, OLD.story_id, OLD.id) ON CONFLICT DO NOTHING;
  RETURN OLD;
END;
$body$;
REVOKE ALL ON FUNCTION public.record_story_session_deletion() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_story_session_deletion ON public.story_sessions;
CREATE TRIGGER trg_story_session_deletion AFTER DELETE ON public.story_sessions
FOR EACH ROW EXECUTE FUNCTION public.record_story_session_deletion();

CREATE OR REPLACE FUNCTION public.save_story_session(
  p_story_id uuid, p_session_id uuid, p_expected_updated_at timestamptz, p_expected_revision bigint,
  p_messages jsonb, p_narrative text, p_mode text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  owner uuid := auth.uid();
  saved public.story_sessions%ROWTYPE;
  item jsonb;
  existing jsonb;
  changed boolean := false;
  newly_created boolean := false;
BEGIN
  IF owner IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(p_messages) IS DISTINCT FROM 'array' OR jsonb_array_length(p_messages) > 1000 THEN
    RAISE EXCEPTION 'invalid_messages' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_mode,'') NOT IN ('select', 'read', 'roleplay') THEN
    RAISE EXCEPTION 'invalid_mode' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO saved FROM public.story_sessions
    WHERE user_id = owner AND story_id = p_story_id FOR UPDATE;
  IF NOT FOUND THEN
    IF p_session_id IS NULL THEN
      RAISE EXCEPTION 'missing_session_id' USING ERRCODE = '22023';
    END IF;
    IF p_expected_revision IS NOT NULL OR EXISTS (
      SELECT 1 FROM public.story_session_deletions
        WHERE session_id = p_session_id AND user_id = owner
    ) THEN RAISE EXCEPTION 'session_deleted' USING ERRCODE = 'P0001'; END IF;
    INSERT INTO public.story_sessions (id, user_id, story_id)
      VALUES (p_session_id, owner, p_story_id) ON CONFLICT (user_id, story_id) DO NOTHING
      RETURNING * INTO saved;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'session_conflict' USING ERRCODE = 'P0001';
    END IF;
    newly_created := true;
  ELSIF p_session_id IS DISTINCT FROM saved.id THEN
    RAISE EXCEPTION 'session_conflict' USING ERRCODE = 'P0001';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_messages) LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object'
      OR coalesce(item->>'id','') = '' OR item->>'id' = 'intro'
      OR coalesce(item->>'role','') NOT IN ('user','assistant')
      OR jsonb_typeof(item->'content') IS DISTINCT FROM 'string'
      OR jsonb_typeof(item->'id') IS DISTINCT FROM 'string'
      OR coalesce(item->>'content','') = ''
      OR coalesce(item->>'timestamp','') = '' THEN
      RAISE EXCEPTION 'invalid_message' USING ERRCODE = '22023';
    END IF;
    SELECT value INTO existing FROM jsonb_array_elements(saved.messages)
      WHERE value->>'id' = item->>'id' LIMIT 1;
    IF FOUND THEN
      IF existing->>'content' IS DISTINCT FROM item->>'content'
        OR existing->>'role' IS DISTINCT FROM item->>'role' THEN
        RAISE EXCEPTION 'message_conflict' USING ERRCODE = 'P0001';
      END IF;
    ELSE
      saved.messages := saved.messages || jsonb_build_array(item);
      changed := true;
    END IF;
  END LOOP;
  -- A lost acknowledgement may be retried; identical writes are idempotent.
  IF NOT newly_created AND (p_expected_updated_at IS DISTINCT FROM saved.updated_at OR p_expected_revision IS DISTINCT FROM saved.memory_revision)
    AND (changed OR saved.narrative IS DISTINCT FROM p_narrative
      OR saved.last_mode IS DISTINCT FROM p_mode) THEN
    RAISE EXCEPTION 'session_conflict' USING ERRCODE = 'P0001';
  END IF;
  IF changed OR saved.narrative IS DISTINCT FROM p_narrative OR saved.last_mode IS DISTINCT FROM p_mode THEN
    UPDATE public.story_sessions SET messages = saved.messages,
      narrative = p_narrative, last_mode = p_mode
      WHERE id = saved.id AND user_id = owner RETURNING * INTO saved;
  END IF;
  RETURN to_jsonb(saved);
END;
$$;
REVOKE ALL ON FUNCTION public.save_story_session(uuid, uuid, timestamptz, bigint, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_story_session(uuid, uuid, timestamptz, bigint, jsonb, text, text) TO authenticated;
NOTIFY pgrst, 'reload schema';
