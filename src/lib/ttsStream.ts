import { supabase } from "@/integrations/supabase/client";
const FUNCTIONS_URL = "/api/speech";
const PCM_SAMPLE_RATE = 24_000;

class SpeechHttpError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
let paymentRequiredUntil = 0;

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

async function requestSpeech(text: string, voice: string, signal: AbortSignal) {
  const { data: { session } } = await supabase.auth.getSession();
  return fetch(FUNCTIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: "Bearer " + session.access_token } : {}),
    },
    body: JSON.stringify({ text, voice, stream: true }),
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

async function receivePcmOnce(text: string, voice: string, signal: AbortSignal, onChunk: (bytes: Uint8Array) => void) {
  const response = await requestSpeech(text, voice, signal);
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => null) as { message?: string; detail?: string } | null;
    if (response.status === 402) paymentRequiredUntil = Date.now() + 60_000;
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
    let event: { type?: string; audio?: string; message?: string };
    try { event = JSON.parse(raw); } catch { return; }
    if (event.type === "speech.error") throw new Error(event.message || "tts_stream_failed");
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

async function receivePcm(text: string, voice: string, signal: AbortSignal, onChunk: (bytes: Uint8Array) => void) {
  if (Date.now() < paymentRequiredUntil) throw new SpeechHttpError(402, "Voice provider has no credits");
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let audioStarted = false;
    try {
      return await receivePcmOnce(text, voice, signal, (bytes) => {
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
export function streamSpeech(text: string, voice: string): SpeechStream {
  const controller = new AbortController();
  let context: AudioContext | null = null;
  const sources = new Set<AudioBufferSourceNode>();
  let stopped = false;
  let schedulingComplete = false;
  let finishPlayback: () => void = () => {};
  let markStarted: () => void = () => {};
  const started = new Promise<void>((resolve) => { markStarted = resolve; });

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
      const textChunks = splitSpeechText(text);
      if (textChunks.length === 0) { stop(); return; }
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
        if (sources.size === 1) markStarted();
      };
      for (const chunk of textChunks) {
        if (stopped) return;
        await receivePcm(chunk, voice, controller.signal, schedule);
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
