import { expect, it, vi } from "vitest";
import { clampLocalEpisodes, createLocalJob, localVideoSrc, probeLocalKineva, renderLocalScene } from "./kinevaLocal";

it("builds a same-PC video url and keeps episode counts between 1 and 3", () => {
  expect(localVideoSrc("/videos/job/clip.mp4")).toBe("http://127.0.0.1:8787/videos/job/clip.mp4");
  expect(clampLocalEpisodes(0)).toBe(1);
  expect(clampLocalEpisodes(9)).toBe(3);
});

it("reads worker health as ready, missing ComfyUI, or missing worker", async () => {
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
    ready: true, template: true, comfy: true,
  }), { status: 200 }));
  const ready = await probeLocalKineva(fetchImpl as unknown as typeof fetch);
  expect(fetchImpl).toHaveBeenCalledWith("http://127.0.0.1:8787/health", expect.objectContaining({
    targetAddressSpace: "loopback",
  }));
  expect(ready.status).toBe("ready");

  const comfyDown = await probeLocalKineva(vi.fn(async () => new Response(JSON.stringify({
    ready: false, template: true, comfy: false,
  }), { status: 503 })) as unknown as typeof fetch);
  expect(comfyDown.status).toBe("missing-comfy");

  const workerDown = await probeLocalKineva(vi.fn(async () => { throw new Error("connection refused"); }) as unknown as typeof fetch);
  expect(workerDown.status).toBe("missing-worker");
});

it("enqueues a local job on 127.0.0.1:8787 and never calls a cloud video function", async () => {
  const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({ idea: "Me levanto y bailo", image: null, episodes: 2, dialogues: [], cast: {} });
    return new Response(JSON.stringify({
      id: "job-1", state: "queued", current: 0, total: 2, videos: [], error: null,
    }), { status: 202 });
  });
  const job = await createLocalJob({ idea: "Me levanto y bailo", episodes: 2 }, fetchImpl as unknown as typeof fetch);
  expect(job.id).toBe("job-1");
  expect(fetchImpl).toHaveBeenCalledWith("http://127.0.0.1:8787/jobs", expect.objectContaining({
    method: "POST",
    targetAddressSpace: "loopback",
  }));
});

it("renders a scene through local ComfyUI and skips devices where Kineva is absent", async () => {
  const png = await renderLocalScene({ focusText: "Ella cruza la calle" }, vi.fn(async (url: string) => {
    if (String(url).endsWith("/health")) {
      return new Response(JSON.stringify({ scenes: true, comfy: true }), { status: 200 });
    }
    return new Response(JSON.stringify({ image: "abc" }), { status: 200 });
  }) as unknown as typeof fetch);
  expect(png).toBe("data:image/png;base64,abc");

  const absent = await renderLocalScene({}, vi.fn(async () => {
    throw new Error("connection refused");
  }) as unknown as typeof fetch);
  expect(absent).toBeNull();

  const oldWorker = await renderLocalScene({}, vi.fn(async () => new Response(JSON.stringify({
    ready: true, comfy: true,
  }), { status: 200 })) as unknown as typeof fetch);
  expect(oldWorker).toBeNull();

  await expect(renderLocalScene({}, vi.fn(async () => new Response(JSON.stringify({
    scenes: true, comfy: false,
  }), { status: 503 })) as unknown as typeof fetch)).rejects.toThrow(/127\.0\.0\.1:8188/);
});
