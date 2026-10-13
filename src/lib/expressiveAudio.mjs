import { vocalSample } from "./vocalSamples.mjs";
import { splitExpressiveScore } from "./expressiveSpeech.mjs";

const reactionCache = new Map();
const MAX_CACHE_BYTES = 8 * 1024 * 1024;
let cacheBytes = 0;

function remember(key, pcm) {
  if (pcm.length > MAX_CACHE_BYTES) return;
  while (reactionCache.size && (cacheBytes + pcm.length > MAX_CACHE_BYTES || reactionCache.size >= 64)) {
    const oldest = reactionCache.keys().next().value;
    cacheBytes -= reactionCache.get(oldest).length;
    reactionCache.delete(oldest);
  }
  reactionCache.set(key, pcm);
  cacheBytes += pcm.length;
}

/** Prepare every part before playback so a failed reaction never silently disappears. */
export async function synthesizeExpressiveScene(score, voice, language, { region = "mx", synthesize, cache = reactionCache, samples = vocalSample, resolvedVoice = voice, deadlineMs = 50_000 } = {}) {
  const separate = new Set(score.reactions.filter((part) => samples(resolvedVoice, language, part.event)).map((part) => part.event));
  const runs = splitExpressiveScore(score, { separate });
  if (!runs.length) return { status: 400, detail: "empty_expressive_scene" };
  const results = new Array(runs.length);
  const startedAt = Date.now();
  let cursor = 0;
  let failed;
  const worker = async () => {
    while (!failed && cursor < runs.length) {
      const index = cursor++;
      const run = runs[index];
      if (Date.now() - startedAt >= deadlineMs) { failed = { status: 504, detail: "expressive_scene_timeout" }; break; }
      if (run.reactions.length && run.segments.length === 1) {
        const sample = samples(resolvedVoice, language, run.reactions[0].event, run.reactions[0].direction);
        if (sample) { results[index] = sample; continue; }
      }
      const key = run.reactions.length && run.segments.length === 1 ? JSON.stringify([voice, language, region, run.reactions[0].event, run.text, run.reactions[0].direction]) : null;
      if (key && cache.has(key)) { results[index] = cache.get(key); continue; }
      const result = await synthesize(run.text, voice, language, { region, expression: run });
      if (result.status !== 200 || !result.pcm?.length || result.pcm.length % 2) {
        failed = result.status === 200 ? { status: 502, detail: "empty_expressive_audio" } : result;
        break;
      }
      results[index] = result.pcm;
      if (key) {
        if (cache === reactionCache) remember(key, result.pcm);
        else cache.set(key, result.pcm);
      }
    }
  };
  // At most two provider requests run at once; completion order never controls playback.
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => { failed = { status: 504, detail: "expressive_scene_timeout" }; resolve(); }, deadlineMs);
  });
  try { await Promise.race([Promise.all([worker(), worker()]), timeout]); }
  finally { clearTimeout(timer); }
  if (failed) return failed;
  let sampleOffset = 0;
  const parts = runs.map((run, index) => {
    const startSample = sampleOffset;
    sampleOffset += results[index].length / 2;
    return { kind: run.reactions.length ? "reaction" : "speech", event: run.reactions[0]?.event, startSample, endSample: sampleOffset };
  });
  return { status: 200, pcm: Buffer.concat(results), parts };
}
