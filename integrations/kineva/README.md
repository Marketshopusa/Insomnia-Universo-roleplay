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

## Local Insomnia creator (no cloud credentials)

On the ComfyUI Windows workstation, run
integrations/kineva/start-local-studio.ps1. Open
http://127.0.0.1:8080/studio/kineva-local in the same PC browser.
This page is part of the Insomnia React app. It accepts a photo and an ordinary
sentence, sends both to the loopback-only local_creator.py service, and lets the
existing ComfyUI LLM expand the visual plan internally. It never asks a user
to edit plan_json or load a DEV_TESTS/*_api.json graph into the UI. A short
series of up to three clips is rendered sequentially; progress, playback and
download are shown on the page.

The server binds only to 127.0.0.1:8787 and accepts POST requests from the
local Insomnia dev origin on port 8080 (or Vite ports 5173/5174). Rendered
videos are served from the local ComfyUI output folder. Restarting the service
clears in-memory job status, though rendered files remain in ComfyUI output.

This local entry point is separate from the cloud Supabase queue. Cloud
deployment, paid-user isolation, provider replacement for Lovable AI, and
connected cloud smoke tests are still pending. Motion and identity fidelity
require visual review for each new use case, particularly standing or dancing
from a seated reference. The current installed ComfyUI image models do not
provide general text-to-image generation; local video creation needs an input
photo. The production KINEVA_WORKFLOW_MASTER_QUALITY.json is untouched.

## Runtime preparation

1. Apply supabase/migrations/20260924220000_kineva_render_jobs.sql,
   20260924221000_kineva_multishot.sql,
   20260925144000_kineva_job_renewal.sql,
   20260925145500_shorts_media_privacy.sql and
   20260925160000_story_gallery_privacy.sql in that order to the shared project only after a backup and schema audit. Deploy the
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
   integrations/kineva/comfy_nodes/KinevaPlanLock. The DEV UI workflow
   also contains an optional Depth guide from its reference image. `KinevaH3FrameCount` sizes the repeated Depth frames
   to a single locked shot. It is disabled by default and is not part of the
   production API template. The installed node was updated and ComfyUI
   restarted; a live RepeatImageBatch/PreviewImage smoke returned 124 frames
   from a 124-frame locked shot (prompt `72818cc0-8b2b-41b1-835b-957b07802cae`).
   Keep the control branch for a fixed-camera shot; the separate candidate
   API graph in DEV_TESTS is not used by the worker.
   The worker preflight confirms
   exact_dialogue, dialogue_language and project_id before it claims any job.
   On this Windows workstation, start an idle ComfyUI session with
   `powershell -ExecutionPolicy Bypass -File integrations/kineva/start-comfy.ps1`.
   Run it first with `-CheckOnly` to verify paths. The launcher finds the
   locally installed `llama-server.exe`, sets `MSB_LLAMA_SERVER` for the
   planner process, and refuses to start while port 8188 is occupied. The
   worker preflight alone does not exercise this planner executable.
3. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY only in the local worker's
   environment. Do not enter them into React, a browser, Cursor chat, or git.
   Ensure ComfyUI is running at http://127.0.0.1:8188 (or set KINEVA_COMFY_URL).
4. On the Windows workstation, the optional `integrations/kineva/start-worker.ps1`
   launcher runs preflight first and prompts for the privileged key without
   echoing it or saving it in the repository. Or run the Python worker manually:

   py -3 integrations\kineva\worker.py --workflow-api "C:\Users\synth\Documents\Kineva-Workflows\ACTIVE\KINEVA_MINISERIES_API_TEMPLATE.json" --input-dir "C:\Users\synth\AppData\Local\Comfy-Desktop\ComfyUI-Shared\input" --output-dir "C:\Users\synth\AppData\Local\Comfy-Desktop\ComfyUI-Shared\output"

5. First run the worker command above with --preflight appended. It needs no
   Supabase credentials and checks ComfyUI nodes, FFmpeg and local directories.
   Then set VITE_KINEVA_ENABLED=true locally for a controlled preview. In Studio choose
   Kineva local miniseries, upload a reference, and generate a project. The first
   episode queues; subsequent episodes stay pending until requested from Shorts.
   The worker must stay running. --once processes one claim and exits. Do not
   enable the live UI until the connected smoke and authorization checks pass.

## Offline checks

From the Insomnia repository run `py -3 -m unittest integrations.kineva.test_contract -v`
to verify the exact MINISERIES and TALKING_PRESENTER script, camera/take settings,
extra-shot rejection, unsafe project ID and worker lease behavior (8 tests).
The worker `--preflight` checks ComfyUI without cloud access. The H3 test with
a single-person reference produced a 15.08-second video with AAC audio, but QC
flagged a seated-to-standing jump at frame 10. Its Plan Lock also spoke the
visual description instead of the five exact words: the installed and tracked
node have been fixed. A plan-only runtime smoke confirmed the exact dialogue;
a short second render has correct transcribed dialogue and no temporal QC issues,
but pans from feet to face instead of opening on the reference composition.
The low-resolution framing preview starts with the face but gradually zooms
out; technical QC marks its deliberate 544x960 resolution as too small.
A Depth Anything v2 visual guide with H3 Fun ControlNet (strength 0.45)
held the subject and background stable in a 544x960 preview: no temporal
cuts, but the size issue is expected at preview resolution. Local ASR
transcribed an extra, unclear phrase that is absent from the locked plan,
so the shot has not passed audio review. The full-resolution 768x1360
render held the same woman, wall and framing throughout, passed technical
QC with `issues=[]`, and scored 0.022260 in the composition probe.
Two independent local ASR models detected extra speech between the exact
requested phrases. It is rejected for audio.
A 13-word, 124-frame Depth preview held its composition (max grayscale
drift 0.032182) and small Spanish ASR transcribed the script; tiny added
an article. At 768x1360, a matched upscale plus refine passed technical QC
and both local ASR models recovered the words, but a blue/purple hair artifact
appears for several seconds: reject it visually. Keeping the same script,
seed, photo and Depth guide, neural upscale with `refine_sigmas=(off)`
passed technical QC, showed no blue hair in sampled frames and both ASR models
recovered the words; it is softer than a CPU Lanczos upscale of the clean
preview. That FFmpeg DEV comparison yields 768x1360, 124 frames, no sampled
blue artifact, no measured cuts and a bitstream-identical AAC track. It is
a diagnostic candidate, not a worker-approved master: listening, lip sync,
multiple shots and the official manifest remain pending. The comparison
implicates refinement in this particular artifact, without proving its cause.
The optional `py -3 integrations/kineva/composition_probe.py <video.mp4>`
samples grayscale frames; two drifting previews scored 0.271663 and
0.249837, while a Depth preview scored 0.021717. This diagnostic has no
calibrated acceptance threshold and cannot detect colored hair artifacts.

A second 13-word shot was rendered locally with the same reference and wall,
MINISERIES Plan Lock and the live `KinevaH3FrameCount` guide; its 124-frame
544x960 preview has the expected size-only QC issue and no measured cuts.
A separate CPU Lanczos DEV upscale produced 768x1360 while copying the AAC
bitstream. The real worker `assemble` function joined both CPU clips through
a local fake Storage adapter: 248 video frames at 24 fps (10.333 s), AAC
audio and a 10.374 s container duration including audio padding. Sampled
frames show the same woman, outfit and wall across the cut; the grayscale
seam delta was 0.018708 at 96x168 pixels (a diagnostic, not a threshold).
Both Spanish ASR models transcribed both complete lines in the assembly.
Standalone tiny ASR misheard one word in the second shot, so listening is
necessary. The loudness of the two tracks differed by 0.4 LU. The full
report and MP4 are under `Kineva-Workflows/ACTIVE/DEV_TESTS/` on Windows.
These CPU clips do not have official QC/RunManifest acceptance; no remote
Storage or database was touched. Human review of lip sync, voice, appearance
and the full episode remains a release gate.

## Shared Supabase: Insomnia and Kineva

Insomnia remains the main app. The owner chose the existing `kineva-staging`
project (`cexzmelshvbgabihtfvx`) as the candidate for one shared Supabase.
The current frontend still uses Lovable Cloud (`pbormuamewbajnylzfqs`).
Read-only inspection found seven existing Kineva tables with data and no
recorded remote migrations; the read-only dry-run lists all 17 migrations, without validating SQL compatibility.
This inventory does not prove that a full push or a database restore is safe.
Historical migrations insert 85 categories and leave 12 demo stories with
new UUIDs. Before importing the backup's rows, an isolated rehearsal must
verify and remove those seeds from newly created Insomnia tables; see the
runbook for the exact counts and safeguards.

The Lovable database backup and 33 Storage files are verified. The
[local backup script](backup-kineva-staging.ps1) generated and verified the
Kineva database backup; its 29 Storage files were separately copied and
verified against metadata. The existing Kineva `public.users` record has an
integer ID and shares an email with an incoming Auth UUID account. Preserve
both identities and their credentials. Follow
[the migration runbook](MIGRATION_TO_OWN_SUPABASE.md) for the selective
import; keep the backups and media outside Git. After verifying
Auth, storage and Edge Functions, configure `KINEVA_ALLOWED_USER_IDS` with the
creator's Auth UUID. The worker keeps its service-role key only in its local
process. Run the private Studio-to-Shorts smoke and access-denial tests before
changing the published app. The PR remains a draft; no cloud writes yet.

## Production gates

| Gate | Evidence required |
| --- | --- |
| DEV nodes | /object_info has Plan Lock, Voice Router, Background Lock, QC, Master Export, project context and motion preprocessors. Confirmed 2026-09-24. |
| DEV runtime | The first test failed QC at frame 14. A one-person test failed QC at frame 10 and spoke its visual instructions. Plan Lock was fixed; the next 5.875-second H.264/AAC render passed temporal QC and local transcription of the exact five words, but visually pans from legs to face. The lower-resolution framing preview starts on the face, then zooms out. A Depth ControlNet preview and 768x1360 master hold framing stable, but both local ASR models detect unrequested speech in the master despite `qc.issues=[]`. The 13-word, 124-frame preview holds composition; its refined master has a visible blue hair artifact and is rejected. The controlled neural upscale without refine is clean in sampled frames and technically passes QC, but looks soft; a CPU Lanczos diagnostic is sharper, with the source AAC stream preserved byte for byte. Neither is accepted as a published master until human listening, lip sync, official QC/manifest and linked-shot tests; reject the five-word master for extra speech. |
| Job contract | Five migrations, Edge Function, worker and synthetic two-shot FFmpeg assembly pass local checks; eight contract tests cover exact dialogue, presenter settings and lease renewal. Privacy policy and SQL still need connected verification. No cloud mutation yet. |
| Connected smoke | Deploy migration/function, upload a neutral reference, queue one short episode, verify ownership rejection, output path, manifest and playback. Pending. |
| Micro miniseries | Two E01 clips rendered and joined locally with matching sampled identity, wardrobe, background, exact full-episode ASR and closely matched loudness. Human voice/lip review, official CPU QC, a second duration and E02/E03 continuity are pending. No cloud publish. |
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
3. Measure spoken audio against the locked text (speech recognition and listening),
   face similarity, background drift, lip sync, frame breaks and loudness across
   2â€“3 clips. Calibrate composition thresholds on approved and failed takes
   before putting them into the QC manifest. For static shots, size the Depth
   hint to H3's rounded `17k+5` frame count; do not hard-code 141 frames.
4. Test lease renewal with an actual connected long render; add resumable video
   upload, automatic retry policy, private review before publishing, and a credit
   reservation before moving this choice beyond controlled creators.
5. Promote DEV into a versioned production profile only after the connected tests
   and human review. Keep the historical master unchanged.
