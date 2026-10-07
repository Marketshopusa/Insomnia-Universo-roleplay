import { localVideoSrc, type LocalCastInput, type LocalJob } from "@/lib/kinevaLocal";

const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export async function attachFinishedVideos(
  job: LocalJob,
  episodeIds: string[],
  attached: Set<number>,
  deps: {
    fetchVideo: (url: string) => Promise<Blob>;
    upload: (episodeId: string, blob: Blob) => Promise<string>;
    markReady: (episodeId: string, path: string) => Promise<void>;
  },
) {
  for (const video of job.videos || []) {
    if (attached.has(video.episode) || video.approved === false) continue;
    const episodeId = episodeIds[video.episode - 1];
    if (!episodeId || !video.url) continue;
    const blob = await deps.fetchVideo(localVideoSrc(video.url));
    if (!blob.size) throw new Error("ComfyUI no entregó el archivo de este capítulo.");
    const path = await deps.upload(episodeId, blob);
    await deps.markReady(episodeId, path);
    attached.add(video.episode);
  }
}

/** Renders each written chapter on this PC and stores the file on its episode. */
export async function publishLocalChapters(options: {
  chapters: string[];
  dialogues?: string[];
  shotPlans?: { visual: string; dialogue: string }[][];
  episodeIds: string[];
  image?: string | null;
  cast?: LocalCastInput;
  onJob?: (job: LocalJob) => void;
  createJob: (input: { chapters: string[]; dialogues?: string[]; shot_plans?: { visual: string; dialogue: string }[][]; image?: string | null; cast?: LocalCastInput }) => Promise<LocalJob>;
  fetchJob: (id: string) => Promise<LocalJob>;
  fetchVideo: (url: string) => Promise<Blob>;
  upload: (episodeId: string, blob: Blob) => Promise<string>;
  markReady: (episodeId: string, path: string) => Promise<void>;
  pause?: (milliseconds: number) => Promise<void>;
  existingJob?: LocalJob;
}) {
  const pause = options.pause ?? wait;
  const attached = new Set<number>();
  let current = options.existingJob ?? await options.createJob({ chapters: options.chapters, dialogues: options.dialogues, shot_plans: options.shotPlans, image: options.image, cast: options.cast });
  options.onJob?.(current);
  for (let attempt = 0; attempt < 450; attempt += 1) {
    await attachFinishedVideos(current, options.episodeIds, attached, options);
    if (["completed", "failed", "references_ready", "video_review"].includes(current.state)) break;
    await pause(4000);
    current = await options.fetchJob(current.id);
    options.onJob?.(current);
  }
  if (current.state === "failed") {
    throw new Error(current.error || "ComfyUI no pudo crear el video de este capítulo.");
  }
  if (["references_ready", "video_review"].includes(current.state)) return current;
  if (current.state !== "completed") {
    throw new Error("ComfyUI sigue filmando. El capítulo queda en esta serie; vuelve a abrirlo para ver el video.");
  }
  await attachFinishedVideos(current, options.episodeIds, attached, options);
  return current;
}
