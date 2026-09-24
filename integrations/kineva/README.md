# Insomnia Ã— Kineva: miniseries

Insomnia is the public Studio, episode catalogue and playback app. Kineva is the local
render engine on the Windows workstation. The Supabase queue carries job metadata and
the private reference image; ComfyUI remains bound to localhost.

## Current branch

- feature/kineva-insomnia-integration adds a Kineva choice to Studio.
- The novel's character and setting bible is copied into a private series record.
- The creator uploads one reference image (PNG/JPEG/WebP, at most 10 MB) to a private bucket.
- A signed-in creator queues each episode through kineva-video. The function checks
  ownership and never accepts a user supplied ComfyUI graph or local filesystem path.
- The Windows worker claims jobs atomically, maps each scene onto a validated DEV
  API template, obtains the Kineva QC manifest, uploads the master video, and marks
  the episode ready. The old render remains visible while a repair is queued.
- The stable KINEVA_WORKFLOW_MASTER_QUALITY.json is outside this integration.

## Runtime preparation

1. Apply supabase/migrations/20260924220000_kineva_render_jobs.sql to the
   Insomnia project, deploy supabase/functions/kineva-video, and confirm the
   authenticated creator and private storage policies. Do this before enabling the
   Kineva option in the live Studio.
2. Use the validated API workflow at
   C:\Users\synth\Documents\Kineva-Workflows\ACTIVE\KINEVA_MINISERIES_API_TEMPLATE.json.
   It was derived from the successful DEV runtime prompt, with scene/image placeholders,
   Plan Lock MINISERIES, and Static Background Lock disabled. The UI workflow file
   KINEVA_MINISERIES_DEV.json is not an API prompt.
3. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY only in the local worker's
   environment. Do not enter them into React, a browser, Cursor chat, or git.
   Ensure ComfyUI is running at http://127.0.0.1:8188 (or set KINEVA_COMFY_URL).
4. On the Windows workstation run:

   py -3 integrations\kineva\worker.py --workflow-api "C:\Users\synth\Documents\Kineva-Workflows\ACTIVE\KINEVA_MINISERIES_API_TEMPLATE.json" --input-dir "C:\Users\synth\AppData\Local\Comfy-Desktop\ComfyUI-Shared\input" --output-dir "C:\Users\synth\AppData\Local\Comfy-Desktop\ComfyUI-Shared\output"

5. In Studio choose Kineva local Â· miniseries, upload a reference image,
   generate a project, then follow the queued episodes in Shorts. The worker must
   stay running while rendering. --once processes one claim and exits.

## Production gates

| Gate | Evidence required |
| --- | --- |
| DEV nodes | /object_info has Plan Lock, Voice Router, Background Lock, QC, Master Export, project context and motion preprocessors. Confirmed 2026-09-24. |
| DEV runtime | ComfyUI history has a successful full graph with video, audio, QC and manifest; Pose/Depth and H3 Depth ControlNet succeeded. Confirmed 2026-09-24. |
| Job contract | Migration, Edge Function and worker pass local checks; no cloud mutation yet. |
| Connected smoke | Deploy migration/function, upload a neutral reference, queue one short episode, verify ownership rejection, output path, manifest and playback. Pending. |
| Micro miniseries | Render 2â€“3 linked clips with the same reference, wardrobe, setting, voice and scene bible; compare identity and audio across cuts. Pending. |
| Selective repair | Request a second take of one shot; verify other episodes and prior video remain intact and only the approved take replaces the published path. Pending. |
| Release | Human review of visual identity, lip sync, timing, copyright/consent of references and credit accounting. Pending. |

## Shot and continuity contract

Project â†’ episode â†’ scene â†’ shot â†’ take. The queue currently maps one episode
to scene 1 / one shot; the shot and take fields reserve selective repair.
Every shot receives immutable scene text, character/setting bible, reference image,
voice mode H3_DESIGNED, and a unique project folder. Plan Lock preserves dialogue.
The worker requires QC issues = [], audio present and a matching manifest before
publishing. An eventual shot editor should make wardrobe, location, camera, motion
control, voice reference and seed explicit per shot.

## Next engineering passes

1. Connect the deployed app to a real worker and run the neutral one shot smoke.
2. Add a scene/shot editor and persistent wardrobe/location assets instead of
   reusing one reference image for every chapter.
3. Measure face similarity, background drift, dialogue completeness, lip sync,
   frame breaks and loudness across 2â€“3 clips. Put thresholds into the QC manifest.
4. Add a worker heartbeat, lease renewal for long jobs, resumable video upload,
   automatic retry policy, private review before publishing, and a credit reservation
   before moving this choice beyond controlled creators.
5. Promote DEV into a versioned production profile only after the connected tests
   and human review. Keep the historical master unchanged.
