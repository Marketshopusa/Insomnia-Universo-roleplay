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
const START_BUFFER_SAMPLES = SAMPLE_RATE * 1.5;

const WORKLET_SOURCE = `
class PcmStreamProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.queue = [];
    this.offset = 0;
    this.queuedSamples = 0;
    this.started = false;
    this.finished = false;
    this.reportedEnd = false;
    this.startBufferSamples = options.processorOptions.startBufferSamples;
    this.port.onmessage = (event) => {
      if (event.data.type === "chunk") {
        const pcm = new Int16Array(event.data.buffer);
        const floats = new Float32Array(pcm.length);
        for (let i = 0; i < pcm.length; i += 1) floats[i] = pcm[i] / 32768;
        this.queue.push(floats);
        this.queuedSamples += floats.length;
      } else if (event.data.type === "done") {
        this.finished = true;
      }
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0][0];
    output.fill(0);

    if (!this.started) {
      if (this.queuedSamples >= this.startBufferSamples || (this.finished && this.queuedSamples > 0)) {
        this.started = true;
        this.port.postMessage({ type: "started" });
      } else {
        return true;
      }
    }

    let writeOffset = 0;
    while (writeOffset < output.length && this.queue.length > 0) {
      const current = this.queue[0];
      const available = current.length - this.offset;
      const amount = Math.min(output.length - writeOffset, available);
      output.set(current.subarray(this.offset, this.offset + amount), writeOffset);
      writeOffset += amount;
      this.offset += amount;
      this.queuedSamples -= amount;
      if (this.offset >= current.length) {
        this.queue.shift();
        this.offset = 0;
      }
    }

    if (this.finished && this.queuedSamples === 0 && !this.reportedEnd) {
      this.reportedEnd = true;
      this.port.postMessage({ type: "ended" });
      return false;
    }
    return true;
  }
}
registerProcessor("pcm-stream-processor", PcmStreamProcessor);
`;

function decodeBase64(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length - (binary.length % 2));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

/**
 * Feeds streamed PCM into one AudioWorklet output. The worklet keeps a short
 * reserve and consumes it as a continuous sample stream, avoiding the gaps
 * created by hundreds of separately scheduled audio nodes.
 */
export function streamSpeech(text: string, voice: string): SpeechStream {
  const controller = new AbortController();
  let context: AudioContext | null = null;
  let node: AudioWorkletNode | null = null;
  let stopped = false;

  let markStarted: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });

  const stop = () => {
    if (stopped) return;
    stopped = true;
    controller.abort();
    node?.disconnect();
    node = null;
    void context?.close().catch(() => {});
    context = null;
  };

  const done = (async () => {
    let workletUrl: string | null = null;
    try {
      context = new AudioContext({ sampleRate: SAMPLE_RATE });
      if (context.state === "suspended") await context.resume();

      const workletBlob = new Blob([WORKLET_SOURCE], { type: "text/javascript" });
      workletUrl = URL.createObjectURL(workletBlob);
      await context.audioWorklet.addModule(workletUrl);
      URL.revokeObjectURL(workletUrl);
      workletUrl = null;
      if (stopped || !context) return;

      node = new AudioWorkletNode(context, "pcm-stream-processor", {
        outputChannelCount: [1],
        processorOptions: { startBufferSamples: START_BUFFER_SAMPLES },
      });
      node.connect(context.destination);

      let resolvePlayback: () => void = () => {};
      const playbackEnded = new Promise<void>((resolve) => {
        resolvePlayback = resolve;
      });
      node.port.onmessage = (event: MessageEvent<{ type?: string }>) => {
        if (event.data.type === "started") markStarted();
        if (event.data.type === "ended") resolvePlayback();
      };

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
        if (payload.type !== "speech.audio.delta" || !payload.audio || !node) return;
        const buffer = decodeBase64(payload.audio);
        audioBytesReceived += buffer.byteLength;
        node.port.postMessage({ type: "chunk", buffer }, [buffer]);
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
      if (audioBytesReceived < 2 || !node) throw new Error("tts_no_audio");

      node.port.postMessage({ type: "done" });
      await playbackEnded;
      node.disconnect();
      node = null;
      if (!stopped && context) {
        await context.close().catch(() => {});
        context = null;
      }
    } catch (error) {
      if (workletUrl) URL.revokeObjectURL(workletUrl);
      if (stopped || (error instanceof DOMException && error.name === "AbortError")) return;
      node?.disconnect();
      node = null;
      void context?.close().catch(() => {});
      context = null;
      throw error;
    }
  })();

  return { done, stop, started };
}