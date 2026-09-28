import { supabase } from "@/integrations/supabase/client";
import { afterEach, expect, it, vi } from "vitest";
import { streamSpeech } from "./ttsStream";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("starts the first spoken sentence while the next network response is still pending", async () => {
  const bytes = new Uint8Array(24_000 * 2 * 2);
  const view = new DataView(bytes.buffer);
  for (let sample = 0; sample < bytes.length / 2; sample += 1) {
    view.setInt16(sample * 2, 1000, true);
  }
  const audio = Buffer.from(bytes).toString("base64");
  const body = 'data: {"type":"speech.audio.delta","audio":"' + audio + '"}\n\n' +
    'data: {"type":"speech.audio.done"}\n\n';
  let requests = 0;
  const fetchMock = vi.fn(() => {
    requests += 1;
    return requests === 1
      ? Promise.resolve(new Response(body, { status: 200 }))
      : new Promise<Response>(() => {});
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

  const speech = streamSpeech(
    "Primera frase amable que llega rapidamente con varias palabras. " +
    "Segunda frase amable que tarda en llegar con varias palabras.",
    "scarlett-hd",
  );
  await speech.started;
  expect(requests).toBe(2);
  expect(starts).toBe(1);
  speech.stop();
  await speech.done;
});

it("does not retry a payment failure before switching to device speech", async () => {
  const fetchMock = vi.fn(async () =>
    new Response('{"message":"Not enough credits"}', { status: 402 }),
  );
  vi.spyOn(supabase.auth, "getSession").mockResolvedValue({ data: { session: { access_token: "test" } }, error: null } as any);
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("AudioContext", class {
    state = "running";
    close() { return Promise.resolve(); }
  });
  const speech = streamSpeech("Hola, que tal.", "scarlett-hd");
  await expect(speech.done).rejects.toThrow("Not enough credits");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
