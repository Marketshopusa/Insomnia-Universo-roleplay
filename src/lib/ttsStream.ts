const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/text-to-speech`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export interface SpeechStream {
  /** Resolves only after the complete audio has finished playing. */
  done: Promise<void>;
  /** Stops downloading and playback immediately. */
  stop: () => void;
  /** Resolves when audible playback begins. */
  started: Promise<void>;
}

const SAMPLE_RATE = 24000;

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * Receives every streamed PCM byte, verifies the terminal event, then plays
 * one immutable AudioBuffer. A single source cannot underrun between network
 * chunks and guarantees that narration and dialogue finish in full.
 */
export function streamSpeech(text: string, voice: string): SpeechStream {
  const controller = new AbortController();
  let context: AudioContext | null = null;
  let source: AudioBufferSourceNode | null = null;
  let stopped = false;

  let markStarted: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });

  const stop = () => {
    if (stopped) return;
    stopped = true;
    controller.abort();
    try {
      source?.stop();
    } catch {
      // The source may not have started yet.
    }
    source?.disconnect();
    source = null;
    void context?.close().catch(() => {});
    context = null;
  };

  const done = (async () => {
    try {
      context = new AudioContext({ sampleRate: SAMPLE_RATE });
      if (context.state === "suspended") await context.resume();
      if (stopped || !context) return;

      const response = await fetch(FUNCTIONS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify({ text, voice, stream: true }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        throw new Error(`tts_stream_failed_${response.status}`);
      }

      let terminalEventReceived = false;
      let audioBytesReceived = 0;
      const chunks: Uint8Array[] = [];
      const processEventLine = (line: string) => {
        const normalized = line.trimEnd();
        if (!normalized.startsWith("data:")) return;
        const raw = normalized.slice(5).trim();
        if (!raw || raw === "[DONE]") return;

        let payload: { type?: string; audio?: string };
        try {
          payload = JSON.parse(raw);
        } catch {
          return;
        }

        if (payload.type === "speech.audio.done") {
          terminalEventReceived = true;
          return;
        }
        if (payload.type !== "speech.audio.delta" || !payload.audio) return;
        const chunk = decodeBase64(payload.audio);
        audioBytesReceived += chunk.byteLength;
        chunks.push(chunk);
      };

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let eventBuffer = "";
      while (!stopped) {
        const { value, done: streamEnded } = await reader.read();
        if (streamEnded) break;
        eventBuffer += value;
        const lines = eventBuffer.split(/\r?\n/);
        eventBuffer = lines.pop() ?? "";
        lines.forEach(processEventLine);
      }

      if (stopped) return;
      if (eventBuffer.trim()) processEventLine(eventBuffer);
      if (!terminalEventReceived) throw new Error("tts_incomplete_stream");
      const usableBytes = audioBytesReceived - (audioBytesReceived % 2);
      if (usableBytes < 2 || !context) throw new Error("tts_no_audio");

      const pcmBytes = new Uint8Array(usableBytes);
      let byteOffset = 0;
      for (const chunk of chunks) {
        const remaining = usableBytes - byteOffset;
        if (remaining <= 0) break;
        const part = chunk.subarray(0, Math.min(chunk.length, remaining));
        pcmBytes.set(part, byteOffset);
        byteOffset += part.length;
      }

      const samples = new Int16Array(pcmBytes.buffer);
      const audioBuffer = context.createBuffer(1, samples.length, SAMPLE_RATE);
      const channel = audioBuffer.getChannelData(0);
      for (let index = 0; index < samples.length; index += 1) {
        channel[index] = samples[index] / 32768;
      }

      let resolvePlayback: () => void = () => {};
      const playbackEnded = new Promise<void>((resolve) => {
        resolvePlayback = resolve;
      });
      source = context.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(context.destination);
      source.onended = resolvePlayback;
      source.start(context.currentTime + 0.03);
      markStarted();
      await playbackEnded;
      source.disconnect();
      source = null;
      if (!stopped && context) {
        await context.close().catch(() => {});
        context = null;
      }
    } catch (error) {
      if (stopped || (error instanceof DOMException && error.name === "AbortError")) return;
      source?.disconnect();
      source = null;
      void context?.close().catch(() => {});
      context = null;
      throw error;
    }
  })();

  return { done, stop, started };
}