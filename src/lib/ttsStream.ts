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
  const sources: AudioBufferSourceNode[] = [];

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
    ctx = new AudioContext({ sampleRate: 24000 });
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});

    const playChunk = (incoming: Uint8Array) => {
      if (!ctx || stopped) return;
      const bytes = new Uint8Array(pending.length + incoming.length);
      bytes.set(pending);
      bytes.set(incoming, pending.length);
      const usable = bytes.length - (bytes.length % 2);
      pending = bytes.slice(usable);
      if (usable === 0) return;
      const samples = new Int16Array(bytes.buffer, 0, usable / 2);
      const floats = Float32Array.from(samples, (s) => s / 32768);
      const buffer = ctx.createBuffer(1, floats.length, 24000);
      buffer.copyToChannel(floats, 0);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      if (playhead === 0) {
        playhead = ctx.currentTime + 0.05;
        markStarted();
      } else {
        playhead = Math.max(playhead, ctx.currentTime);
      }
      source.start(playhead);
      playhead += buffer.duration;
      sources.push(source);
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
    let buffer = "";
    while (!stopped) {
      const { value, done: finished } = await reader.read();
      if (finished) break;
      buffer += value;
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        for (const line of part.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (!raw || raw === "[DONE]") continue;
          let payload: { type?: string; audio?: string };
          try {
            payload = JSON.parse(raw);
          } catch {
            continue;
          }
          if (payload.type !== "speech.audio.delta" || !payload.audio) continue;
          const binary = atob(payload.audio);
          const chunk = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i += 1) chunk[i] = binary.charCodeAt(i);
          playChunk(chunk);
        }
      }
    }

    if (playhead === 0) throw new Error("tts_no_audio");

    const remaining = Math.max(0, playhead - (ctx?.currentTime ?? 0)) * 1000;
    await new Promise<void>((resolve) => window.setTimeout(resolve, remaining + 120));
    if (!stopped) {
      void ctx?.close().catch(() => {});
      ctx = null;
    }
  })();

  return { done, stop, started };
}
