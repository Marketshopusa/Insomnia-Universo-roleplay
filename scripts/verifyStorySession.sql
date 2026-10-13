BEGIN;
-- Run after applying the atomic session migration; all QA rows roll back.

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"fabef802-6489-4fc8-9404-23043a85c185","role":"authenticated"}', true);
DO $verify$
DECLARE
  sid uuid := '98bc9ce8-c8a2-4681-a8fb-40a874d0a8da';
  story uuid := 'dd56b0f0-0c75-4e1b-81f1-98b0815c2a9a';
  first jsonb; second jsonb; reply jsonb; turns jsonb; m jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM public.story_sessions WHERE story_id=story) THEN
    RAISE EXCEPTION 'QA identifier already in use';
  END IF;
  SELECT jsonb_agg(jsonb_build_object('id', 'turn-'||i, 'role', 'user',
    'content', CASE WHEN i=25 THEN repeat('Miramos las salas. ',100)||'La brújula violeta quedó en el cajón verde.' ELSE 'Cuadro '||i END,
    'timestamp', '2026-10-13T21:00:00Z') ORDER BY i) INTO turns FROM generate_series(1,102) i;
  first := public.save_story_session(story,sid,null,null,turns,null,'roleplay');
  IF jsonb_array_length(first->'messages')<>102 OR first->'messages'->24->>'content' NOT LIKE '%cajón verde.' THEN
    RAISE EXCEPTION 'Full canonical history was not saved';
  END IF;
  -- A lost first-write acknowledgement is safe to replay.
  reply := public.save_story_session(story,sid,null,null,turns,null,'roleplay');
  IF (reply->>'memory_revision')::bigint <> (first->>'memory_revision')::bigint THEN
    RAISE EXCEPTION 'Idempotent retry advanced revision';
  END IF;
  m := jsonb_build_array(jsonb_build_object('id','new-turn','role','user','content','Ahora salimos al jardín.','timestamp','2026-10-13T21:01:00Z'));
  second := public.save_story_session(story,sid,(first->>'updated_at')::timestamptz,(first->>'memory_revision')::bigint,m,null,'roleplay');
  IF jsonb_array_length(second->'messages')<>103 THEN RAISE EXCEPTION 'Append failed'; END IF;
  BEGIN
    PERFORM public.save_story_session(story,sid,(first->>'updated_at')::timestamptz,(first->>'memory_revision')::bigint,
      '[{"id":"stale","role":"user","content":"Old tab","timestamp":"2026-10-13T21:02:00Z"}]',null,'roleplay');
    RAISE EXCEPTION 'Stale writer accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'session_conflict' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.save_story_session(story,sid,(second->>'updated_at')::timestamptz,(second->>'memory_revision')::bigint,
      '[{"id":"new-turn","role":"user","content":"Changed history","timestamp":"2026-10-13T21:02:00Z"}]',null,'roleplay');
    RAISE EXCEPTION 'Message mutation accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'message_conflict' THEN RAISE; END IF;
  END;
  PERFORM set_config('request.jwt.claims','{"sub":"49c872ac-747f-40cd-8b76-d931cd61b588","role":"authenticated"}',true);
  IF EXISTS (SELECT 1 FROM public.story_sessions WHERE id=sid) THEN RAISE EXCEPTION 'Cross-user read'; END IF;
  PERFORM set_config('request.jwt.claims','{"sub":"fabef802-6489-4fc8-9404-23043a85c185","role":"authenticated"}',true);
  DELETE FROM public.story_sessions WHERE id=sid;
  BEGIN
    PERFORM public.save_story_session(story,sid,null,null,turns,null,'roleplay');
    RAISE EXCEPTION 'Deleted session revived by first-write retry';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'session_deleted' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.story_sessions WHERE id=sid) THEN RAISE EXCEPTION 'Delete failed'; END IF;
END;
$verify$;
SELECT 'PASS: full history, long message, append, retry, stale-tab conflict, immutable messages, user isolation, delete, no resurrection' AS verification;
ROLLBACK;
