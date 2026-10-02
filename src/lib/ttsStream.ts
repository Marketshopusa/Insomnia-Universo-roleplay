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

type Performance = "neutral" | "amused" | "sad" | "pain" | "pleasure" | "scream" | "soft";

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

function splitSpeechText(text: string, maximumLength = 700): string[] {
  const clean = text.replace(/[*_#`]/g, "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?…]+(?:\.{3}|[.!?…]+)|[^.!?…]+$/g) ?? [clean];
  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    const value = current.trim();
    if (value) chunks.push(value);
    current = "";
  };

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    if (trimmed.length > maximumLength) {
      pushCurrent();
      const clauses = trimmed.split(/(?<=[,;:])\s+/);
      for (const clause of clauses) {
        if (clause.length <= maximumLength) {
          if (current && `${current} ${clause}`.length > maximumLength) pushCurrent();
          current = current ? `${current} ${clause}` : clause;
          continue;
        }
        const words = clause.split(/\s+/);
        for (const word of words) {
          if (current && `${current} ${word}`.length > maximumLength) pushCurrent();
          current = current ? `${current} ${word}` : word;
        }
      }
      pushCurrent();
      continue;
    }
    if (current && `${current} ${trimmed}`.length > maximumLength) pushCurrent();
    current = current ? `${current} ${trimmed}` : trimmed;
  }
  pushCurrent();
  return chunks;
}

export function roleplaySpeechText(text: string): string {
  const performance = roleplayPerformance(text);
  // Pleasure and pain stay in the prompt. Gemini speaks the other tags as sounds.
  const cue = performance === "scream" ? "[gasps]"
    : performance === "sad" ? "[crying]"
    : performance === "amused" ? "[laughing]"
    : performance === "soft" ? "[sigh]"
    : "";
  let spoken = text
    .replace(/\*([^*]+)\*/g, (_, direction: string) => ` ${direction.trim()}. `)
    .replace(/[*_#`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!spoken) return "";
  spoken = spoken.replace(/\ba+h{2,}\b/gi, "Ay").replace(/\bm{3,}\b/gi, "Mmm");
  return [cue && !spoken.startsWith(cue) ? cue : "", spoken].filter(Boolean).join(" ");
}

export function roleplayPerformance(text: string): Performance {
  const directions = [...text.matchAll(/\*([^*]+)\*/g)].map((match) => match[1]).join(" ");
  const spoken = text.replace(/\*[^*]+\*/g, " ");
  if (/(?:placer|pleasure|gemido de placer|gimo de placer|(?:^|\s)gim[oe]\b)/i.test(directions)
    && !/dolor|pain/i.test(directions)) return "pleasure";
  if (/(?:dolor|pain|quejid|me dol[ií]|grito de dolor)/i.test(directions)) return "pain";
  if (/(?:grito|chill|scream|miedo|sust[oa]|aterr|tembl|p[aá]nic|rabia|furia|enoj)/i.test(`${directions} ${spoken}`)) return "scream";
  if (/(?:angust|nervios|avergonz)/i.test(directions)) return "sad";
  if (/(?:solloz|llor|l[aá]grima|\bcry\b|\bsob\b)/i.test(directions)) return "sad";
  if (/(?:\br[ií][eo]\b|\brisas?\b|carcajad|sonr[ií]|laugh)/i.test(directions)) return "amused";
  if (/(?:suspiro|exhalo|susurr|whisper|sigh)/i.test(directions)) return "soft";
  if (/(?:\b(?:ja){2,}ja\b|\b(?:je){2,}je\b|\bjaja+\b|\bjeje+\b)/i.test(spoken)) return "amused";
  return "neutral";
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
  const audioSeconds = totalBytes / 2 / PCM_SAMPLE_RATE;
  const spokenWords = text.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
  if (audioSeconds < Math.max(0.8, spokenWords * 0.19)) throw new Error("tts_audio_too_short");
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
      const textChunks = splitSpeechText(roleplay ? roleplaySpeechText(text) : text, roleplay ? 900 : 700);
      const performance = roleplay ? roleplayPerformance(text) : "neutral";
      if (textChunks.length === 0) { stop(); return; }
      if (!roleplay && textChunks[0].length > 220) {
        const firstParts = splitSpeechText(textChunks[0], 180);
        if (firstParts.length > 1) textChunks.splice(0, 1, firstParts[0], firstParts.slice(1).join(" "));
      }
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
      for (const chunk of textChunks) {
        if (stopped) return;
        await receivePcm(chunk, voice, language, region, performance, roleplay, controller.signal, schedule);
      }
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
