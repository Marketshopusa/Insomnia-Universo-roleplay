const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/text-to-speech`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export interface SpeechStream {
  /** Resolves only after the complete audio has finished playing. */
  done: Promise<void>;
  /** Stops downloading and playback immediately. */
  stop: () => void;
  /** Resolves when the complete, continuous track starts playing. */
  started: Promise<void>;
}

const SAMPLE_RATE = 24000;

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * Receives every PCM fragment, verifies the terminal event, then plays one
 * continuous AudioBuffer. A single source avoids gaps caused by scheduling
 * dozens of tiny, independently arriving browser audio nodes.
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
      // The source may already have ended.
    }
    source = null;
    void context?.close().catch(() => {});
    context = null;
  };

  const done = (async () => {
    try {
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

      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      let terminalEventReceived = false;

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
        chunks.push(chunk);
        totalBytes += chunk.length;
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
      if (totalBytes < 2) throw new Error("tts_no_audio");

      const evenByteLength = totalBytes - (totalBytes % 2);
      const pcm = new Uint8Array(evenByteLength);
      let offset = 0;
      for (const chunk of chunks) {
        const remaining = evenByteLength - offset;
        if (remaining <= 0) break;
        const portion = chunk.subarray(0, Math.min(chunk.length, remaining));
        pcm.set(portion, offset);
        offset += portion.length;
      }

      context = new AudioContext({ sampleRate: SAMPLE_RATE });
      if (context.state === "suspended") await context.resume();
      if (stopped) return;

      const samples = new Int16Array(pcm.buffer, pcm.byteOffset, evenByteLength / 2);
      const floats = new Float32Array(samples.length);
      for (let index = 0; index < samples.length; index += 1) {
        floats[index] = samples[index] / 32768;
      }

      const audioBuffer = context.createBuffer(1, floats.length, SAMPLE_RATE);
      audioBuffer.copyToChannel(floats, 0);
      source = context.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(context.destination);

      const playbackEnded = new Promise<void>((resolve) => {
        source?.addEventListener("ended", () => resolve(), { once: true });
      });
      source.start(context.currentTime + 0.05);
      markStarted();
      await playbackEnded;

      source = null;
      if (!stopped) {
        await context.close().catch(() => {});
        context = null;
      }
    } catch (error) {
      if (stopped || (error instanceof DOMException && error.name === "AbortError")) return;
      throw error;
    }
  })();

  return { done, stop, started };
}