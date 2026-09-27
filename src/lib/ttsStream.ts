const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/text-to-speech`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
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
  return fetch(FUNCTIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ text, voice, stream: true }),
    signal,
  });
}

function splitSpeechText(text: string, maximumLength = 70): string[] {
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

async function receivePcmOnce(text: string, voice: string, signal: AbortSignal) {
  const response = await requestSpeech(text, voice, signal);
  if (!response) throw new Error("tts_no_response");
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => null) as { message?: string; detail?: string } | null;
    if (response.status === 402) paymentRequiredUntil = Date.now() + 60_000;
    throw new SpeechHttpError(response.status, payload?.message || payload?.detail || `tts_failed_${response.status}`);
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let pendingText = "";
  let byteCarry: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  let receivedDone = false;
  const chunks: Uint8Array[] = [];

  const processLine = (line: string) => {
    if (!line.startsWith("data:")) return;
    const raw = line.slice(5).trim();
    if (!raw || raw === "[DONE]") return;
    let event: { type?: string; audio?: string };
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }
    if (event.type === "speech.audio.done") {
      receivedDone = true;
      return;
    }
    if (event.type !== "speech.audio.delta" || !event.audio) return;
    const decoded = decodePcm(event.audio, byteCarry);
    byteCarry = decoded.carry;
    if (decoded.bytes.length > 0) chunks.push(decoded.bytes);
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    pendingText += value;
    const lines = pendingText.split(/\r?\n/);
    pendingText = lines.pop() ?? "";
    lines.forEach(processLine);
  }
  if (pendingText.trim()) processLine(pendingText);
  if (!receivedDone) throw new Error("tts_stream_incomplete");
  if (byteCarry.length > 0 || chunks.length === 0) throw new Error("tts_audio_incomplete");
  const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const audioSeconds = totalBytes / 2 / PCM_SAMPLE_RATE;
  const spokenWords = text.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
  const minimumSeconds = Math.max(0.8, spokenWords * 0.19);
  if (audioSeconds < minimumSeconds) throw new Error("tts_audio_too_short");
  return chunks;
}

async function receivePcm(text: string, voice: string, signal: AbortSignal) {
  if (Date.now() < paymentRequiredUntil) {
    throw new SpeechHttpError(402, "Voice provider has no credits");
  }
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await receivePcmOnce(text, voice, signal);
    } catch (error) {
      if (signal.aborted || (error instanceof SpeechHttpError && error.status < 500 && error.status !== 429)) throw error;
      lastError = error;
      if (attempt === 0) await wait(350);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("tts_audio_incomplete");
}

function trimBoundarySilence(bytes: Uint8Array, retainMilliseconds = 70) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const threshold = 180;
  const retainSamples = Math.floor((PCM_SAMPLE_RATE * retainMilliseconds) / 1000);
  let firstAudible = 0;
  let lastAudible = sampleCount - 1;

  while (firstAudible < sampleCount && Math.abs(view.getInt16(firstAudible * 2, true)) < threshold) {
    firstAudible += 1;
  }
  while (lastAudible > firstAudible && Math.abs(view.getInt16(lastAudible * 2, true)) < threshold) {
    lastAudible -= 1;
  }

  const start = Math.max(0, firstAudible - retainSamples);
  const end = Math.min(sampleCount, lastAudible + retainSamples + 1);
  return bytes.slice(start * 2, end * 2);
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
 * Fetches independent, short utterances in parallel but starts playback as
 * soon as the first validated utterance is ready. The browser schedules the
 * remaining utterances on one AudioContext clock as they arrive.
 */
export function streamSpeech(text: string, voice: string): SpeechStream {
  const controller = new AbortController();
  let context: AudioContext | null = null;
  const sources = new Set<AudioBufferSourceNode>();
  let stopped = false;
  let schedulingComplete = false;
  let finishPlayback: () => void = () => {};
  let finishCancelled: () => void = () => {};
  const cancelled = new Promise<null>((resolve) => { finishCancelled = () => resolve(null); });

  let markStarted: () => void = () => {};
  const started = new Promise<void>((resolve) => { markStarted = resolve; });

  const stop = () => {
    if (stopped) return;
    stopped = true;
    controller.abort();
    finishCancelled();
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
      if (Date.now() < paymentRequiredUntil) {
        throw new SpeechHttpError(402, "Voice provider has no credits");
      }
      context = new AudioContext({ sampleRate: PCM_SAMPLE_RATE });
      if (context.state === "suspended") await context.resume();
      if (stopped || !context) return;
      const playbackEnded = new Promise<void>((resolve) => { finishPlayback = resolve; });
      const textChunks = splitSpeechText(text);
      if (textChunks.length === 0) return;
      // At most three upstream requests at once; long reading passages should
      // not trigger a burst of rate limits before the first sentence is spoken.
      type Result = { pcm: Uint8Array[] | null; error: Error | null };
      const pending = textChunks.map(() => {
        let resolve!: (value: Result) => void;
        const promise = new Promise<Result>((done) => { resolve = done; });
        return { promise, resolve };
      });
      let nextRequest = 0;
      const worker = async () => {
        while (nextRequest < textChunks.length && !controller.signal.aborted) {
          const index = nextRequest++;
          try {
            const pcm = await receivePcm(textChunks[index], voice, controller.signal);
            pending[index].resolve({ pcm, error: null });
          } catch (error) {
            pending[index].resolve({
              pcm: null,
              error: error instanceof Error ? error : new Error("tts_failed"),
            });
          }
        }
      };
      for (let i = 0; i < Math.min(3, textChunks.length); i += 1) void worker();

      let scheduledAt = context.currentTime;
      for (const request of pending) {
        const result = await Promise.race([request.promise, cancelled]);
        if (!result) return;
        if (result.error) throw result.error;
        if (stopped || !context || !result.pcm) return;
        const length = result.pcm.reduce((sum, part) => sum + part.byteLength, 0);
        const joined = new Uint8Array(length);
        let offset = 0;
        for (const part of result.pcm) {
          joined.set(part, offset);
          offset += part.byteLength;
        }
        const chunk = trimBoundarySilence(joined);
        const samples = new Float32Array(chunk.byteLength / 2);
        const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
        for (let index = 0; index < chunk.byteLength; index += 2) {
          samples[index / 2] = view.getInt16(index, true) / 32768;
        }
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
        const startAt = Math.max(scheduledAt, context.currentTime + 0.025);
        source.start(startAt);
        scheduledAt = startAt + buffer.duration;
        if (sources.size === 1) markStarted();
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
