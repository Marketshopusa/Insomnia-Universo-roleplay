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

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * Requests one complete WAV file and lets the browser decode it before playing.
 * This avoids PCM framing and mobile streaming issues that can cut or stutter.
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
      context = new AudioContext();
      if (context.state === "suspended") await context.resume();
      if (stopped || !context) return;

      const response = await fetch(FUNCTIONS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify({ text, voice, stream: false }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null) as {
        audioContent?: string;
        message?: string;
        detail?: string;
      } | null;
      if (!response.ok || !payload?.audioContent) {
        throw new Error(payload?.message || payload?.detail || `tts_failed_${response.status}`);
      }
      if (stopped || !context) return;

      const encodedAudio = decodeBase64(payload.audioContent);
      const wavBytes = encodedAudio.buffer.slice(
        encodedAudio.byteOffset,
        encodedAudio.byteOffset + encodedAudio.byteLength,
      );
      const audioBuffer = await context.decodeAudioData(wavBytes);
      if (stopped || !context || audioBuffer.length === 0) return;

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