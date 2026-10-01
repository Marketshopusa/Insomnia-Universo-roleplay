import { supabase } from "@/integrations/supabase/client";
import { afterEach, expect, it, vi } from "vitest";
import { streamSpeech } from "./ttsStream";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("starts playback as soon as a PCM chunk arrives, before the stream closes", async () => {
  const bytes = new Uint8Array(24_000 * 2 * 2);
  const view = new DataView(bytes.buffer);
  for (let sample = 0; sample < bytes.length / 2; sample += 1) view.setInt16(sample * 2, 1000, true);
  const audio = Buffer.from(bytes).toString("base64");
  let closeStream: ReadableStreamDefaultController<Uint8Array> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      closeStream = controller;
      controller.enqueue(new TextEncoder().encode('data: {"type":"speech.audio.delta","audio":"' + audio + '"}\n\n'));
    },
  });
  let speechRequests = 0;
  const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
    const payload = JSON.parse(String(init?.body || "{}"));
    if (payload.metric) return Promise.resolve(new Response(null, { status: 204 }));
    speechRequests += 1;
    return Promise.resolve(new Response(stream, { status: 200 }));
  });
  vi.spyOn(supabase.auth, "getSession").mockResolvedValue({ data: { session: { access_token: "test" } }, error: null } as any);
  vi.stubGlobal("fetch", fetchMock);

  let starts = 0;
  class AudioContextMock {
    currentTime = 0;
    state = "running";
    destination = {};
    createBuffer(_channels: number, samples: number, rate: number) {
      return { duration: samples / rate, copyToChannel: () => {} };
    }
    createBufferSource() {
      return {
        buffer: null,
        onended: null,
        connect: () => {},
        disconnect: () => {},
        start: () => { starts += 1; },
        stop: () => {},
      };
    }
    close() { return Promise.resolve(); }
  }
  vi.stubGlobal("AudioContext", AudioContextMock);

  const speech = streamSpeech("Hola, bienvenida a nuestra historia.", "scarlett-hd");
  await speech.started;
  expect(speechRequests).toBe(1);
  expect(starts).toBe(1);
  closeStream?.enqueue(new TextEncoder().encode('data: {"type":"speech.audio.done"}\n\n'));
  closeStream?.close();
  speech.stop();
  await speech.done;
});
it("uses the device voice when Gemini has exhausted its voice quota", async () => {
  const speechRequests: unknown[] = [];
  vi.spyOn(supabase.auth, "getSession").mockResolvedValue({ data: { session: { access_token: "test" } }, error: null } as any);
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    const payload = JSON.parse(String(init?.body || "{}"));
    if (payload.metric) return new Response(null, { status: 204 });
    speechRequests.push(payload);
    return new Response('{"message":"Quota exhausted"}', { status: 429 });
  }));
  vi.stubGlobal("AudioContext", class {
    state = "running";
    close() { return Promise.resolve(); }
  });

  const spoken: string[] = [];
  const synthesizer = {
    getVoices: () => [{ lang: "es-MX", name: "Voz natural", default: true }],
    cancel: vi.fn(),
    speak: vi.fn((utterance: SpeechSynthesisUtterance) => {
      spoken.push(utterance.text);
      queueMicrotask(() => {
        utterance.onstart?.({} as SpeechSynthesisEvent);
        utterance.onend?.({} as SpeechSynthesisEvent);
      });
    }),
  };
  vi.stubGlobal("speechSynthesis", synthesizer);
  vi.stubGlobal("SpeechSynthesisUtterance", class {
    text: string;
    lang = "";
    voice: SpeechSynthesisVoice | null = null;
    rate = 1;
    onstart: ((event: SpeechSynthesisEvent) => void) | null = null;
    onend: ((event: SpeechSynthesisEvent) => void) | null = null;
    onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null;
    constructor(text: string) { this.text = text; }
  });

  const fallback = vi.fn();
  const speech = streamSpeech("Hola, quÃ© tal.", "scarlett-hd", "es", fallback);
  await speech.started;
  await speech.done;
  expect(speechRequests).toHaveLength(1);
  expect(spoken).toEqual(["Hola, quÃ© tal."]);
  expect(fallback).toHaveBeenCalledTimes(1);
});
