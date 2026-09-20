const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/text-to-speech`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export interface SpeechStream {
  /** resolves when the whole audio finished playing */
  done: Promise<void>;
  /** stops playback immediately */
  stop: () => void;
  /** resolves as soon as the first audio chunk starts playing */
  started: Promise<void>;
}

/**
 * Streams TTS audio (raw 24kHz PCM over SSE) and plays each chunk as it arrives,
 * so the voice starts almost immediately instead of waiting for the full file.
 */
export function streamSpeech(text: string, voice: string): SpeechStream {
  const controller = new AbortController();
  let ctx: AudioContext | null = null;
  let stopped = false;
  let playhead = 0;
  let pending = new Uint8Array(0);
  let queuedBytes: Uint8Array[] = [];
  let queuedByteLength = 0;
  let playbackStarted = false;
  const sources: AudioBufferSourceNode[] = [];
  let lastPlayback: Promise<void> = Promise.resolve();

  // A short reserve absorbs irregular network delivery. Without it, each
  // sentence-sized SSE delta can run out just before the next one arrives.
  const SAMPLE_RATE = 24000;
  const BYTES_PER_SAMPLE = 2;
  const START_BUFFER_SECONDS = 0.9;
  const MIN_BLOCK_SECONDS = 0.12;
  const START_BUFFER_BYTES = SAMPLE_RATE * BYTES_PER_SAMPLE * START_BUFFER_SECONDS;
  const MIN_BLOCK_BYTES = SAMPLE_RATE * BYTES_PER_SAMPLE * MIN_BLOCK_SECONDS;

  let markStarted: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });

  const stop = () => {
    stopped = true;
    controller.abort();
    sources.forEach((s) => {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    });
    void ctx?.close().catch(() => {});
    ctx = null;
  };

  const done = (async () => {
    try {
      ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
      if (ctx.state === "suspended") await ctx.resume().catch(() => {});

      const scheduleBytes = (incoming: Uint8Array) => {
        if (!ctx || stopped) return;
        const bytes = new Uint8Array(pending.length + incoming.length);
        bytes.set(pending);
        bytes.set(incoming, pending.length);
      const usable = bytes.length - (bytes.length % 2);
      pending = bytes.slice(usable);
      if (usable === 0) return;
      const samples = new Int16Array(bytes.buffer, 0, usable / 2);
      const floats = Float32Array.from(samples, (s) => s / 32768);
        const buffer = ctx.createBuffer(1, floats.length, SAMPLE_RATE);
      buffer.copyToChannel(floats, 0);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      if (playhead === 0) {
          playhead = ctx.currentTime + 0.08;
        markStarted();
      } else {
          playhead = Math.max(playhead, ctx.currentTime + 0.02);
      }
      source.start(playhead);
      playhead += buffer.duration;
      sources.push(source);
      lastPlayback = new Promise<void>((resolve) => {
        source.addEventListener("ended", () => resolve(), { once: true });
      });
      };

      const flushQueue = (force = false) => {
        if (queuedByteLength === 0) return;
        if (!playbackStarted && !force && queuedByteLength < START_BUFFER_BYTES) return;
        if (playbackStarted && !force && queuedByteLength < MIN_BLOCK_BYTES) return;

        const combined = new Uint8Array(queuedByteLength);
        let offset = 0;
        for (const chunk of queuedBytes) {
          combined.set(chunk, offset);
          offset += chunk.length;
        }
        queuedBytes = [];
        queuedByteLength = 0;
        playbackStarted = true;
        scheduleBytes(combined);
      };

      const enqueueChunk = (chunk: Uint8Array) => {
        queuedBytes.push(chunk);
        queuedByteLength += chunk.length;
        flushQueue();
      };

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
      if (payload.type !== "speech.audio.delta" || !payload.audio) return;
      const binary = atob(payload.audio);
      const chunk = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) chunk[i] = binary.charCodeAt(i);
        enqueueChunk(chunk);
      };

      const res = await fetch(FUNCTIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({ text, voice, stream: true }),
      signal: controller.signal,
    });
      if (!res.ok || !res.body) throw new Error(`tts_stream_failed_${res.status}`);

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let textBuffer = "";
      while (!stopped) {
        const { value, done: finished } = await reader.read();
        if (finished) break;
        textBuffer += value;
        const lines = textBuffer.split(/\r?\n/);
        textBuffer = lines.pop() ?? "";
        for (const line of lines) {
          processEventLine(line);
        }
      }

      // Process an event without a trailing newline, then schedule every byte
      // left in the reserve before considering the speech complete.
      if (textBuffer.trim()) processEventLine(textBuffer);
      flushQueue(true);

      if (playhead === 0) throw new Error("tts_no_audio");

      // Wait for the browser's final scheduled source before reopening the mic.
      await lastPlayback;
      if (!stopped) {
        void ctx?.close().catch(() => {});
        ctx = null;
      }
    } catch (error) {
      // An intentional stop/hang-up must not trigger browser speech fallback.
      if (stopped || (error instanceof DOMException && error.name === "AbortError")) return;
      throw error;
    }
  })();

  return { done, stop, started };
}
