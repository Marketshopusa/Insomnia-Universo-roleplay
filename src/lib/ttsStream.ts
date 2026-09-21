const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/text-to-speech`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const PCM_SAMPLE_RATE = 24_000;
const PREBUFFER_SAMPLES = PCM_SAMPLE_RATE * 2;

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

function decodePcm(value: string, carry: Uint8Array): { samples: Float32Array; carry: Uint8Array } {
  const binary = atob(value);
  const bytes = new Uint8Array(carry.length + binary.length);
  bytes.set(carry);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[carry.length + index] = binary.charCodeAt(index);
  }
  const usableLength = bytes.length - (bytes.length % 2);
  const nextCarry = bytes.slice(usableLength);
  const samples = new Float32Array(usableLength / 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset, usableLength);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = view.getInt16(index * 2, true) / 32768;
  }
  return { samples, carry: nextCarry };
}

const WORKLET_SOURCE = `
class GaplessPcmPlayer extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.queue = [];
    this.offset = 0;
    this.buffered = 0;
    this.started = false;
    this.ended = false;
    this.drained = false;
    this.prebuffer = options.processorOptions.prebuffer;
    this.port.onmessage = (event) => {
      if (event.data.type === "samples") {
        const samples = event.data.samples;
        this.queue.push(samples);
        this.buffered += samples.length;
      } else if (event.data.type === "end") {
        this.ended = true;
      }
      if (!this.started && (this.buffered >= this.prebuffer || (this.ended && this.buffered > 0))) {
        this.started = true;
        this.port.postMessage({ type: "started" });
      }
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0][0];
    output.fill(0);
    if (!this.started) return true;
    let writeOffset = 0;
    while (writeOffset < output.length && this.queue.length > 0) {
      const current = this.queue[0];
      const available = current.length - this.offset;
      const amount = Math.min(available, output.length - writeOffset);
      output.set(current.subarray(this.offset, this.offset + amount), writeOffset);
      writeOffset += amount;
      this.offset += amount;
      this.buffered -= amount;
      if (this.offset === current.length) {
        this.queue.shift();
        this.offset = 0;
      }
    }
    if (this.ended && this.buffered === 0 && !this.drained) {
      this.drained = true;
      this.port.postMessage({ type: "drained" });
    }
    return !this.drained;
  }
}
registerProcessor("gapless-pcm-player", GaplessPcmPlayer);
`;

/**
 * Streams PCM into one AudioWorklet with a two-second reserve. The audio clock
 * consumes one continuous queue, so network packet boundaries cannot create
 * audible joins or the tiny gaps caused by scheduling many separate sources.
 */
export function streamSpeech(text: string, voice: string): SpeechStream {
  const controller = new AbortController();
  let context: AudioContext | null = null;
  let node: AudioWorkletNode | null = null;
  let workletUrl: string | null = null;
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
    node?.disconnect();
    node = null;
    void context?.close().catch(() => {});
    context = null;
    if (workletUrl) URL.revokeObjectURL(workletUrl);
    workletUrl = null;
  };

  const done = (async () => {
    try {
      context = new AudioContext({ sampleRate: PCM_SAMPLE_RATE });
      if (context.state === "suspended") await context.resume();
      if (stopped || !context) return;

      workletUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "text/javascript" }));
      await context.audioWorklet.addModule(workletUrl);
      if (stopped || !context) return;

      node = new AudioWorkletNode(context, "gapless-pcm-player", {
        outputChannelCount: [1],
        processorOptions: { prebuffer: PREBUFFER_SAMPLES },
      });
      node.connect(context.destination);

      const playbackEnded = new Promise<void>((resolve) => {
        finishPlayback = resolve;
      });
      node.port.onmessage = (event: MessageEvent<{ type?: string }>) => {
        if (event.data.type === "started") markStarted();
        if (event.data.type === "drained") finishPlayback();
      };

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
        if (event.type !== "speech.audio.delta" || !event.audio || !node) return;
        const decoded = decodePcm(event.audio, byteCarry);
        byteCarry = decoded.carry;
        if (decoded.samples.length > 0) {
          node.port.postMessage({ type: "samples", samples: decoded.samples }, [decoded.samples.buffer]);
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
      node.port.postMessage({ type: "end" });
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