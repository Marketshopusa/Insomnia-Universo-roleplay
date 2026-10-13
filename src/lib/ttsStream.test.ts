import { supabase } from "@/integrations/supabase/client";
import { afterEach, expect, it, vi } from "vitest";
import { roleplayPerformance, roleplaySpeechText, streamSpeech } from "./ttsStream";

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
    expect(payload.text).toBe("*Río* Hola, bienvenida a nuestra historia.");
    expect(payload.roleplay).toBe(true);
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

  const speech = streamSpeech("*Río* Hola, bienvenida a nuestra historia.", "scarlett-hd", "es", true);
  await speech.started;
  expect(speechRequests).toBe(1);
  expect(starts).toBe(1);
  closeStream?.enqueue(new TextEncoder().encode('data: {"type":"speech.audio.done"}\n\n'));
  closeStream?.close();
  speech.stop();
  await speech.done;
});
it("does not play a mismatched device voice when neural TTS has no quota", async () => {
  const fetchMock = vi.fn(async () => new Response('{"message":"Neural voice quota exhausted"}', { status: 429 }));
  vi.spyOn(supabase.auth, "getSession").mockResolvedValue({ data: { session: { access_token: "test" } }, error: null } as any);
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("AudioContext", class {
    state = "running";
    close() { return Promise.resolve(); }
  });
  const deviceSpeak = vi.fn();
  vi.stubGlobal("speechSynthesis", { speak: deviceSpeak, cancel: vi.fn() });
  const speech = streamSpeech("Hola, que tal.", "scarlett-hd", "es");
  await expect(speech.done).rejects.toThrow("Neural voice quota exhausted");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(deviceSpeak).not.toHaveBeenCalled();
});

it("keeps the public playback helpers aligned with the ordered score", () => {
  expect(roleplaySpeechText("*Sonrío* Hola.")).toBe("Sonrío. Hola.");
  expect(roleplayPerformance("*Sonrío* Hola.")).toBe("warm");
  expect(roleplaySpeechText("*Sollozo* Lo siento.")).toBe("Hh... ah... hh... Lo siento.");
  expect(roleplaySpeechText("*Río*")).toBe("[laughing] Ja, ja, ja...");
  expect(roleplaySpeechText("*Grito de dolor* «Ahhh, no me toques»"))
    .toBe("[shouting] ¡Aaaah! «Ahhh, no me toques»");
});
