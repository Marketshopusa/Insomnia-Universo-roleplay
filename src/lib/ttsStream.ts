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

      const response = await requestSpeech(text, voice, controller.signal);
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
      let totalBytes = 0;

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
        if (decoded.bytes.length > 0) {
          chunks.push(decoded.bytes);
          totalBytes += decoded.bytes.length;
        }
      };

      while (true) {
        const { value, done: streamEnded } = await reader.read();
        if (streamEnded) break;
        pendingText += value;
        const lines = pendingText.split(/\r?\n/);
        pendingText = lines.pop() ?? "";
        lines.forEach(processLine);
      }
      if (pendingText.trim()) processLine(pendingText);
      if (stopped) return;
      if (!receivedDone) throw new Error("tts_stream_incomplete");
      if (byteCarry.length > 0 || totalBytes === 0) throw new Error("tts_audio_incomplete");

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