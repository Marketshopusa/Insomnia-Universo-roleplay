import { vocalSample } from "./vocalSamples.mjs";
import { splitExpressiveScore } from "./expressiveSpeech.mjs";

const reactionCache = new Map();
const SAMPLE_RATE = 24_000;
const REACTION_LIMITS = { laugh: 1.6, chuckle: 0.8, cry: 2, sob: 1.2, scream: 1.2, pain_scream: 1.2 };
const MAX_REACTION_SECONDS = 6;

function briefReaction(pcm, event, secondsLeft = MAX_REACTION_SECONDS) {
  const seconds = Math.min(REACTION_LIMITS[event] || 1, secondsLeft);
  const length = Math.min(pcm.length, Math.max(0, Math.floor(seconds * SAMPLE_RATE)) * 2);
  if (length === pcm.length) return pcm;
  const trimmed = Buffer.from(pcm.subarray(0, length));
  const fadeSamples = Math.min(480, length / 2);
  for (let n = 0; n < fadeSamples; n++) {
    const offset = length - (fadeSamples - n) * 2;
    trimmed.writeInt16LE(Math.round(trimmed.readInt16LE(offset) * (1 - n / Math.max(1, fadeSamples - 1))), offset);
  }
  return trimmed;
}
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
export async function synthesizeExpressiveScene(score, voice, language, { performance = "neutral", region = "mx", synthesize, cache = reactionCache, samples = vocalSample, resolvedVoice = voice, deadlineMs = 50_000, onAudio } = {}) {
  // Isolate every reaction so limiting a sound can never cut spoken words.
  const separate = new Set(score.reactions.map((part) => part.event));
  const counts = new Map();
  let events = 0;
  const runs = splitExpressiveScore(score, { separate }).filter((run) => {
    if (!run.reactions.length) return true;
    const event = run.reactions[0].event;
    const family = /^(laugh|chuckle)$/.test(event) ? "laughter" : event;
    const count = counts.get(family) || 0;
    if (count >= 2 || events >= 4) return false;
    counts.set(family, count + 1);
    events++;
    return true;
  });
  if (!runs.length) return { status: 400, detail: "empty_expressive_scene" };
  const results = new Array(runs.length);
  const startedAt = Date.now();
  let cursor = 0;
  let failed;
  let nextEmit = 0;
  const emitReady = () => {
    if (typeof onAudio !== "function") return;
    while (nextEmit < runs.length && results[nextEmit]) {
      onAudio(results[nextEmit]);
      nextEmit++;
    }
  };
  const worker = async () => {
    while (!failed && cursor < runs.length) {
      const index = cursor++;
      const run = runs[index];
      if (Date.now() - startedAt >= deadlineMs) { failed = { status: 504, detail: "expressive_scene_timeout" }; break; }
      if (run.reactions.length && run.segments.length === 1) {
        const sample = samples(resolvedVoice, language, run.reactions[0].event, run.reactions[0].direction);
        if (sample) {
          results[index] = briefReaction(sample, run.reactions[0].event);
          emitReady();
          continue;
        }
      }
      const key = run.reactions.length && run.segments.length === 1 ? JSON.stringify([voice, language, region, run.reactions[0].event, run.text, run.reactions[0].direction]) : null;
      if (key && cache.has(key)) {
        results[index] = briefReaction(cache.get(key), run.reactions[0].event);
        emitReady();
        continue;
      }
      const result = await synthesize(run.text, voice, language, { region, performance: run.performance || score.performance || performance, expression: run });
      if (result.status !== 200 || !result.pcm?.length || result.pcm.length % 2) {
        failed = result.status === 200 ? { status: 502, detail: "empty_expressive_audio" } : result;
        break;
      }
      results[index] = key || run.reactions.length ? briefReaction(result.pcm, run.reactions[0].event) : result.pcm;
      if (key) {
        if (cache === reactionCache) remember(key, results[index]);
        else cache.set(key, results[index]);
      }
      emitReady();
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
  let remainingSeconds = MAX_REACTION_SECONDS;
  for (let index = 0; index < runs.length; index++) {
    if (!runs[index].reactions.length) continue;
    results[index] = briefReaction(results[index], runs[index].reactions[0].event, remainingSeconds);
    remainingSeconds -= results[index].length / 2 / SAMPLE_RATE;
  }
  let sampleOffset = 0;
  const parts = runs.map((run, index) => {
    const startSample = sampleOffset;
    sampleOffset += results[index].length / 2;
    return { kind: run.reactions.length ? "reaction" : "speech", event: run.reactions[0]?.event, startSample, endSample: sampleOffset };
  });
  return { status: 200, pcm: Buffer.concat(results), parts };
}