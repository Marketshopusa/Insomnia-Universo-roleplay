import { supabase } from "@/integrations/supabase/client";
const FUNCTIONS_URL = "/api/speech";
const PCM_SAMPLE_RATE = 24_000;

class SpeechHttpError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export interface SpeechStream {
  /** Resolves only after the complete audio has finished playing. */
  done: Promise<void>;
  /** Stops downloading and playback immediately. */
  stop: () => void;
  /** Resolves when audible playback begins. */
  started: Promise<void>;
}

const wait = (milliseconds: number) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

type Performance = "neutral" | "warm" | "surprised" | "amused" | "sad" | "pain" | "pleasure" | "scream" | "soft";

async function requestSpeech(text: string, voice: string, language: string, region: string, performance: Performance, roleplay: boolean, signal: AbortSignal) {
  const { data: { session } } = await supabase.auth.getSession();
  return fetch(FUNCTIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: "Bearer " + session.access_token } : {}),
    },
    body: JSON.stringify({ text, voice, language, region, performance, roleplay, stream: true }),
    signal,
  });
}

type VocalEvent = { tag: string; performance: Performance; burst?: string };

function eventFor(action: string): VocalEvent | null {
  const value = action.toLowerCase();
  if (/\b(?:no|sin)\s+(?:grit|re[ií]r|llor|gem|gim)/i.test(value)) return null;
  if (/(?:gemid|gim|jade|moan)/i.test(value))
    return { tag: "", performance: /dolor|golpe|herid/i.test(value) ? "pain" : "pleasure", burst: /dolor|golpe|herid/i.test(value) ? "¡Ay!" : "Ah..." };
  if (/(?:grit|chill|alarl|scream)/i.test(value))
    return { tag: "[shouting]", performance: "scream", burst: "¡Ah!" };
  if (/(?:solloz|llor|cry|sob)/i.test(value))
    return { tag: "[sigh]", performance: "sad" };
  if (/(?<![\p{L}\p{N}])(?:r[ií][oó]|re[ií]mos|re[ií]r|risas?)(?![\p{L}\p{N}])|carcajad|laugh/iu.test(value))
    return { tag: "[laughing]", performance: "amused" };
  if (/(?:sorprend|sobresalt|asombr|surpris|startl)/i.test(value))
    return { tag: "", performance: "surprised" };
  if (/(?:sonr[ií]|sonris|smil)/i.test(value))
    return { tag: "", performance: "warm" };
  if (/(?:suspiro|susurr|sigh|whisper)/i.test(value))
    return { tag: "[sigh]", performance: "soft" };
  return null;
}

function cleanSceneText(value: string): string {
  return value.replace(/\[[^\]]{1,40}\]/g, " ").replace(/[*_#`]/g, " ").replace(/\s+/g, " ").trim();
}

/** Assemble one continuous score in story order: narration, vocal reaction, dialogue. */
export function performSpeech(text: string): { text: string; performance: Performance } {
  const pieces = text.split(/(\*[^*]+\*)/g).filter(Boolean);
  const score: string[] = [];
  let performance: Performance = "neutral";
  let pending: VocalEvent | null = null;
  for (let index = 0; index < pieces.length; index += 1) {
    const piece = pieces[index];
    const stage = /^\*[^*]+\*$/.test(piece);
    const words = cleanSceneText(stage ? piece.slice(1, -1) : piece);
    if (!words) continue;
    if (stage) {
      if (pending) {
        if (pending.tag) score.push(pending.tag);
        if (pending.burst) score.push(pending.burst);
      }
      // Narration stays audible; a smile is never interpreted as laughter.
      score.push(/[.!?…]$/.test(words) ? words : words + ".");
      pending = eventFor(words);
      if (pending) performance = pending.performance;
      continue;
    }
    let spoken = words.replace(/\ba+h{2,}\b/gi, "Ay").replace(/\bm{3,}\b/gi, "Mmm");
    // Plain narrative has no asterisks. Put an audible reaction at the event,
    // without turning a smile or a general emotion into an unrelated laugh.
    if (pieces.length === 1) {
      spoken = spoken.replace(/(?<![\p{L}\p{N}])(grit[oó]|peg[oó] un grito|gimi[oó]|gime|solloz[oó]|se ech[oó] a llorar|ri[oó] a carcajadas)(?![\p{L}\p{N}])/giu,
        (action) => {
          const event = eventFor(action);
          if (!event) return action;
          performance = event.performance;
          return [action, event.tag, event.burst].filter(Boolean).join(" ");
        });
    }
    if (pending) {
      const hasVocalAnswer = /^[¡!¿?]*\s*(?:ay|ah|oh|uff|ja)/i.test(spoken);
      if (pending.tag) score.push(pending.tag);
      if (pending.burst && !hasVocalAnswer) score.push(pending.burst);
      pending = null;
    }
    score.push(spoken);
  }
  if (pending) {
    if (pending.tag) score.push(pending.tag);
    if (pending.burst) score.push(pending.burst);
  }
  return { text: score.join(" ").replace(/\s+/g, " ").replace(/([!?])\./g, "$1").trim(), performance };
}

export function roleplaySpeechText(text: string): string {
  return performSpeech(text).text;
}

export function roleplayPerformance(text: string): Performance {
  return performSpeech(text).performance;
}

async function receivePcmOnce(text: string, voice: string, language: string, region: string, performance: Performance, roleplay: boolean, signal: AbortSignal, onChunk: (bytes: Uint8Array) => void) {
  const response = await requestSpeech(text, voice, language, region, performance, roleplay, signal);
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => null) as { message?: string; detail?: string } | null;
    throw new SpeechHttpError(response.status, payload?.message || payload?.detail || `tts_failed_${response.status}`);
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let pendingText = "";
  let byteCarry: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  let receivedDone = false;
  let totalBytes = 0;
  const processLine = (line: string) => {
    if (!line.startsWith("data:")) return;
    const raw = line.slice(5).trim();
    if (!raw || raw === "[DONE]") return;
    let event: { type?: string; audio?: string; message?: string; provider?: string };
    try { event = JSON.parse(raw); } catch { return; }
    if (event.type === "speech.error") throw new Error(event.message || "tts_stream_failed");
    if (event.type === "speech.provider") return;
    if (event.type === "speech.audio.done") {
      receivedDone = true;
      return;
    }
    if (event.type !== "speech.audio.delta" || !event.audio) return;
    const decoded = decodePcm(event.audio, byteCarry);
    byteCarry = decoded.carry;
    if (decoded.bytes.length > 0) {
      totalBytes += decoded.bytes.length;
      onChunk(decoded.bytes);
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      pendingText += value;
      const lines = pendingText.split(/\r?\n/);
      pendingText = lines.pop() ?? "";
      lines.forEach(processLine);
    }
    if (pendingText.trim()) processLine(pendingText);
  } finally {
    reader.releaseLock();
  }
  if (!receivedDone || byteCarry.length > 0 || totalBytes === 0) throw new Error("tts_stream_incomplete");
  if (totalBytes / 2 / PCM_SAMPLE_RATE < 0.35) throw new Error("tts_audio_too_short");
}

async function receivePcm(text: string, voice: string, language: string, region: string, performance: Performance, roleplay: boolean, signal: AbortSignal, onChunk: (bytes: Uint8Array) => void) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let audioStarted = false;
    try {
      return await receivePcmOnce(text, voice, language, region, performance, roleplay, signal, (bytes) => {
        audioStarted = true;
        onChunk(bytes);
      });
    } catch (error) {
      // Once any PCM is audible, retrying would repeat the start of the phrase.
      if (signal.aborted || audioStarted || (error instanceof SpeechHttpError && error.status < 500)) throw error;
      lastError = error;
      if (attempt === 0) await wait(350);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("tts_audio_incomplete");
}

function decodePcm(value: string, carry: Uint8Array): { bytes: Uint8Array; carry: Uint8Array } {
  const binary = atob(value);
  const bytes = new Uint8Array(carry.length + binary.length);
  bytes.set(carry);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[carry.length + index] = binary.charCodeAt(index);
  }
  const usableLength = bytes.length - (bytes.length % 2);
  const nextCarry = bytes.slice(usableLength);
  return { bytes: bytes.slice(0, usableLength), carry: nextCarry };
}

/**
 * Plays PCM as the provider sends it. All pieces share one AudioContext clock,
 * so they remain in order without waiting for the full phrase to download.
 */
export function streamSpeech(text: string, voice: string, language = "es", roleplay = false, region = "mx"): SpeechStream {
  const controller = new AbortController();
  let context: AudioContext | null = null;
  const sources = new Set<AudioBufferSourceNode>();
  let stopped = false;
  let schedulingComplete = false;
  let finishPlayback: () => void = () => {};
  let markStarted: () => void = () => {};
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  const requestedAt = performance.now();
  let playbackReported = false;
  const reportFirstPlayback = () => {
    if (playbackReported) return;
    playbackReported = true;
    markStarted();
    const elapsedMs = Math.round(performance.now() - requestedAt);
    // Only a duration is sent; the story and spoken text stay out of telemetry.
    void supabase.auth.getSession().then(({ data }) => {
      if (!data.session?.access_token) return;
      return fetch(FUNCTIONS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + data.session.access_token,
        },
        body: JSON.stringify({ metric: "first_playback", elapsedMs }),
        keepalive: true,
      });
    }).catch(() => {});
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    controller.abort();
    finishPlayback();
    for (const source of sources) {
      try { source.stop(); } catch { /* Already ended. */ }
      source.disconnect();
    }
    sources.clear();
    void context?.close().catch(() => {});
    context = null;
  };

  const done = (async () => {
    try {
      context = new AudioContext({ sampleRate: PCM_SAMPLE_RATE });
      if (context.state === "suspended") await context.resume();
      if (stopped || !context) return;
      const playbackEnded = new Promise<void>((resolve) => { finishPlayback = resolve; });
      const prepared = performSpeech(text);
      const spoken = prepared.text;
      const performance = prepared.performance;
      if (!spoken) { stop(); return; }
      let scheduledAt = context.currentTime;

      const schedule = (bytes: Uint8Array) => {
        if (stopped || !context) return;
        const samples = new Float32Array(bytes.byteLength / 2);
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        for (let i = 0; i < bytes.byteLength; i += 2) samples[i / 2] = view.getInt16(i, true) / 32768;
        const buffer = context.createBuffer(1, samples.length, PCM_SAMPLE_RATE);
        buffer.copyToChannel(samples, 0);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        sources.add(source);
        source.onended = () => {
          sources.delete(source);
          source.disconnect();
          if (schedulingComplete && sources.size === 0) finishPlayback();
        };
        const startAt = Math.max(scheduledAt, context.currentTime + (scheduledAt === 0 ? 0.08 : 0.025));
        source.start(startAt);
        scheduledAt = startAt + buffer.duration;
        if (sources.size === 1) reportFirstPlayback();
      };
      await receivePcm(spoken, voice, language, region, performance, roleplay || performance !== "neutral", controller.signal, schedule);
      schedulingComplete = true;
      if (sources.size === 0) finishPlayback();
      await playbackEnded;
      if (!stopped) stop();
    } catch (error) {
      if (stopped || (error instanceof DOMException && error.name === "AbortError")) return;
      stop();
      throw error;
    }
  })();

  return { done, stop, started };
}