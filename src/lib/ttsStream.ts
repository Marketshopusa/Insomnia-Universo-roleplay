const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/text-to-speech`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const PCM_SAMPLE_RATE = 24_000;

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
  let response: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    response = await fetch(FUNCTIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({ text, voice, stream: true }),
      signal,
    });
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === 1) return response;
    await response.body?.cancel();
    await wait(800 + Math.floor(Math.random() * 300));
  }
  return response;
}

function splitSpeechText(text: string, maximumLength = 110): string[] {
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

async function receivePcm(text: string, voice: string, signal: AbortSignal) {
  const response = await requestSpeech(text, voice, signal);
  if (!response) throw new Error("tts_no_response");
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => null) as { message?: string; detail?: string } | null;
    throw new Error(payload?.message || payload?.detail || `tts_failed_${response.status}`);
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
  return chunks;
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
 * Receives and validates the complete PCM response before starting one native
 * AudioBufferSourceNode. Network stalls can therefore never insert silence or
 * make playback finish before the final phrase.
 */
export function streamSpeech(text: string, voice: string): SpeechStream {
  const controller = new AbortController();
  let context: AudioContext | null = null;
  let source: AudioBufferSourceNode | null = null;
  let stopped = false;
  let finishPlayback: () => void = () => {};

  let markStarted: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });

  const stop = () => {
    if (stopped) return;
    stopped = true;
    controller.abort();
    finishPlayback();
    source?.stop();
    source?.disconnect();
    source = null;
    void context?.close().catch(() => {});
    context = null;
  };

  const done = (async () => {
    try {
      context = new AudioContext({ sampleRate: PCM_SAMPLE_RATE });
      if (context.state === "suspended") await context.resume();
      if (stopped || !context) return;

      const playbackEnded = new Promise<void>((resolve) => {
        finishPlayback = resolve;
      });

      const textChunks = splitSpeechText(text);
      if (textChunks.length === 0) return;
      // Gemini can occasionally mark a long utterance complete after speaking
      // only its opening. Short, sentence-safe requests make every part
      // independently complete; they are then joined before playback so the
      // browser still receives one continuous native audio track.
      const responses = await Promise.all(
        textChunks.map(async (chunk) => {
          const pcm = await receivePcm(chunk, voice, controller.signal);
          const joinedLength = pcm.reduce((sum, part) => sum + part.byteLength, 0);
          const joined = new Uint8Array(joinedLength);
          let offset = 0;
          for (const part of pcm) {
            joined.set(part, offset);
            offset += part.byteLength;
          }
          return [trimBoundarySilence(joined)];
        }),
      );
      if (stopped) return;
      const chunks = responses.flat();
      const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);

      const samples = new Float32Array(totalBytes / 2);
      let sampleOffset = 0;
      for (const chunk of chunks) {
        const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
        for (let index = 0; index < chunk.byteLength; index += 2) {
          samples[sampleOffset] = view.getInt16(index, true) / 32768;
          sampleOffset += 1;
        }
      }
      if (stopped || !context) return;
      const buffer = context.createBuffer(1, samples.length, PCM_SAMPLE_RATE);
      buffer.copyToChannel(samples, 0);
      source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.onended = finishPlayback;
      markStarted();
      source.start();
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