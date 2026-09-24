# Insomnia Ã— Kineva: miniseries

Insomnia is the public Studio, episode catalogue and playback app. Kineva is the local
render engine on the Windows workstation. The Supabase queue carries job metadata and
the private reference image; ComfyUI remains bound to localhost.

## Current branch

- feature/kineva-insomnia-integration adds a Kineva choice to Insomnia Studio
  when VITE_KINEVA_ENABLED=true. Insomnia remains the creator UI and Shorts player.
- The novel generator asks for short, connected chapters in Kineva mode; Studio
  rejects chapters over 384 spoken words before uploading assets. The novel's
  character and setting bible is copied into a draft series record.
- The creator uploads one reference image (PNG/JPEG/WebP, at most 10 MB) to a private bucket.
- A signed-in allowlisted creator queues a chapter through kineva-video. The function
  checks ownership, splits all spoken words into at most 12 shots (32 words each),
  and never accepts a user supplied ComfyUI graph or local filesystem path.
  Each job stores the exact spoken segment separately from its visual prompt.
- The Windows worker claims jobs atomically, maps each scene onto a validated DEV
  API template, obtains the Kineva QC manifest, uploads the master video, and marks
  each shot. After all latest takes pass QC, FFmpeg joins the shots and publishes
  one episode video. The old render remains visible while a repair is queued.
  The owner reviews every episode in Shorts and publishes the series explicitly
  after all montages are ready.
- The stable KINEVA_WORKFLOW_MASTER_QUALITY.json is outside this integration.

## Runtime preparation

1. Apply supabase/migrations/20260924220000_kineva_render_jobs.sql and then
   20260924221000_kineva_multishot.sql to the Insomnia project. Deploy the
   kineva-video Edge Function. Set KINEVA_ALLOWED_USER_IDS to comma-separated
   creator UUIDs in the function environment. Confirm owner and private storage
   policies; never place the service-role key in a browser or repo.
2. Use the validated API workflow at
   C:\Users\synth\Documents\Kineva-Workflows\ACTIVE\KINEVA_MINISERIES_API_TEMPLATE.json.
   It was derived from the successful DEV runtime prompt, with scene/image placeholders,
   Plan Lock MINISERIES, an exact spoken-script input, stable series project ID,
   and Static Background Lock disabled. The UI workflow file
   KINEVA_MINISERIES_DEV.json is not an API prompt. Restart ComfyUI after updating
   the KinevaPlanLock custom node. The version used here is at
   integrations/kineva/comfy_nodes/KinevaPlanLock. The worker preflight confirms
   exact_dialogue, dialogue_language and project_id before it claims any job.
3. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY only in the local worker's
   environment. Do not enter them into React, a browser, Cursor chat, or git.
   Ensure ComfyUI is running at http://127.0.0.1:8188 (or set KINEVA_COMFY_URL).
4. On the Windows workstation run:

   py -3 integrations\kineva\worker.py --workflow-api "C:\Users\synth\Documents\Kineva-Workflows\ACTIVE\KINEVA_MINISERIES_API_TEMPLATE.json" --input-dir "C:\Users\synth\AppData\Local\Comfy-Desktop\ComfyUI-Shared\input" --output-dir "C:\Users\synth\AppData\Local\Comfy-Desktop\ComfyUI-Shared\output"

5. First run the worker command above with --preflight appended. It needs no
   Supabase credentials and checks ComfyUI nodes, FFmpeg and local directories.
   Then set VITE_KINEVA_ENABLED=true locally for a controlled preview. In Studio choose
   Kineva local miniseries, upload a reference, and generate a project. The first
   episode queues; subsequent episodes stay pending until requested from Shorts.
   The worker must stay running. --once processes one claim and exits. Do not
   enable the live UI until the connected smoke and authorization checks pass.

## Offline checks

From the Insomnia repository run `py -3 -m unittest integrations.kineva.test_contract -v` to verify that Plan Lock restores each spoken segment, rejects an extra planner shot and refuses an unsafe project ID. The worker `--preflight` checks ComfyUI without cloud access. A schema-only test on a separate ComfyUI instance does not replace a full H3 clip or a connected Insomnia Studio-to-Shorts test.

## Supabase connection when the project owner is available

The frontend already has its public project URL and publishable key. Sign in to
Supabase for this exact Insomnia project with an Owner/Admin account, link the
Supabase CLI, inspect the pending migrations, then apply both in order and deploy
generate-novel plus kineva-video. Set KINEVA_ALLOWED_USER_IDS in Edge Function
secrets to the creator Auth UUID. The local worker needs SUPABASE_URL and the
privileged SUPABASE_SERVICE_ROLE_KEY only in its private process environment;
never commit or send that key through Cursor chat. After ComfyUI restarts and
--preflight passes, perform a private neutral render and an owner-denial check
through Insomnia Studio and Shorts. The draft PR is not a live deployment.

## Production gates

| Gate | Evidence required |
| --- | --- |
| DEV nodes | /object_info has Plan Lock, Voice Router, Background Lock, QC, Master Export, project context and motion preprocessors. Confirmed 2026-09-24. |
| DEV runtime | Prior full graph has video, audio, QC and manifest; Pose/Depth and H3 Depth ControlNet succeeded. New Plan Lock fields loaded in a separate ComfyUI instance on 2026-09-24. A full clip with the new exact-dialogue field is pending. |
| Job contract | Two migrations, Edge Function, worker and synthetic two-shot FFmpeg assembly pass local checks; plan text equality passes local positive/negative cases. No cloud mutation yet. |
| Connected smoke | Deploy migration/function, upload a neutral reference, queue one short episode, verify ownership rejection, output path, manifest and playback. Pending. |
| Micro miniseries | Render 2â€“3 linked clips with the same reference, wardrobe, setting, voice and scene bible; compare identity and audio across cuts. Pending. |
| Selective repair | Request a second take of one shot; verify other episodes and prior video remain intact and only the approved take replaces the published path. Pending. |
| Release | Human review of visual identity, lip sync, timing, copyright/consent of references and credit accounting. Pending. |

## Shot and continuity contract

Project â†’ episode â†’ scene â†’ shot â†’ take. A chapter of up to 384 words becomes
1â€“12 ordered shots, each with its exact spoken segment. Longer chapters are rejected
without truncation. The assembled episode becomes ready only after all latest shots pass QC.
Every shot receives immutable scene text, character/setting bible, reference image,
voice mode H3_DESIGNED, and a unique project folder. Plan Lock preserves dialogue.
The worker requires QC issues = [], audio present and a matching manifest for
each shot. Assembly checks all clip dimensions, frame rate, audio, duration and
final file size (50 MB project limit) before publishing. An eventual shot editor should make wardrobe, location, camera, motion
control, voice reference and seed explicit per shot.

## Next engineering passes

1. Connect the deployed app to a real worker and run a neutral two-shot smoke,
   including access denial for another account and an overlong chapter.
2. Add a scene/shot editor and persistent wardrobe/location assets instead of
   reusing one reference image for every chapter.
3. Measure spoken audio against the locked text (speech recognition), face similarity,
   background drift, lip sync,
   frame breaks and loudness across 2â€“3 clips. Put thresholds into the QC manifest.
4. Add a worker heartbeat, lease renewal for long jobs, resumable video upload,
   automatic retry policy, private review before publishing, and a credit reservation
   before moving this choice beyond controlled creators.
5. Promote DEV into a versioned production profile only after the connected tests
   and human review. Keep the historical master unchanged.
