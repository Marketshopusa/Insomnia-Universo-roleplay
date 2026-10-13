# Persistent story memory and continuity — 2026-10-13

The session archive already existed in Supabase, but the character only received a shortened client window. Multiple layers clipped the ends of turns and older memories. The local prompt also imposed tone changes from turn count rather than the story. Save failures could look successful, and a failed restore could appear as a new conversation.

## Changes

- Canonical messages remain complete in `story_sessions`, isolated by authenticated user and story. Neither context selection nor queue cleanup expires the archive.
- `save_story_session` appends immutable message IDs atomically. A revision rejects stale writes; retries are idempotent. Deletion markers contain IDs only and prevent delayed requests from reviving deleted conversations.
- `src/lib/storySession.mjs` waits for the server acknowledgement, recovers pending writes when browser storage is available, and makes load/save conflicts visible. An unanswered turn retains its identity when retried.
- Both inference routes retrieve the authenticated archive. `src/lib/storyContext.mjs` selects older evidence and relevant prop facts from the entire history, preserving chronology, original speakers and the full latest message.
- `integrations/kineva/adult_chat_worker.py` preserves the latest action, removes automatic tone phases, uses structured output and checks repetitions, known prop facts and completed operations.
- The local continuity review regenerates conflicting drafts. Its evidence must be quoted from actual input; hallucinated review evidence cannot reject a reply. Direct, unambiguous prop questions have a grounded factual fallback.
- Age safeguards block the adult route for a known minor, including one remembered outside the recent window. Nonsexual conversations can use the nonadult route. No sexual scene involving a minor was used for QA.
- Microphone/transcription logic, neural speech implementation and Kineva workflow JSON files were not changed.

## Verification

- PostgreSQL checks using authenticated RLS: complete 102-turn history, long-message endings, append, acknowledgement replay, stale-tab conflict, immutable message IDs, cross-user isolation, explicit delete and prevention of resurrection. QA rows roll back.
- Frontend/backend unit checks cover reload recovery, session changes, persistent current-turn identity, current versus historical facts, actor/ownership continuity and age safeguards.
- Ten nonsexual fixtures ran against the existing local GPU model. The archived run is in `STORY_MEMORY_LOCAL_VERIFICATION.json`. It includes a middle fact after 102 turns, a later user correction, delivery ownership, completed actions and a long latest message.
- The previous speech tests and the transcription tests still pass. Production build passes.
- TypeScript's separate full-project check still reports the pre-existing generated Supabase types / studio errors; those unrelated areas were not changed.

## Limits

The complete archive is persistent; the model's active context remains bounded. Older facts are retrieved rather than placing every message into every request. The fixture checks and local review reduce known failures but do not guarantee perfect interpretation of every possible story. The review can add several seconds of local inference. Browser drafts are best effort; server acknowledgement is the source of truth.

## Runtime

Web chat: `src/pages/StoryDetail.tsx` → atomic Supabase session writes → `api/ai.mjs` or the authenticated `adult-story-chat` function → local `adult_chat_worker.py`. Queue responses expire separately from conversation memory. Deleting the conversation removes its stored messages; deletion markers retain no conversation text.
