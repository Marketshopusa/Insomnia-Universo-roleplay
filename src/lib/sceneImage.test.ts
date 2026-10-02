import { expect, it, vi } from "vitest";
import { generateSceneImage } from "./sceneImage";

it("uses the ComfyUI image on this computer and does not queue a cloud job", async () => {
  const invoke = vi.fn();
  const url = await generateSceneImage({ focusText: "Ella cruza la calle" }, {
    renderLocal: async () => "data:image/png;base64,abc",
    invoke: invoke as never,
  });
  expect(url).toBe("data:image/png;base64,abc");
  expect(invoke).not.toHaveBeenCalled();
});

it("reads a finished cloud image when this device has no ComfyUI", async () => {
  const invoke = vi.fn()
    .mockResolvedValueOnce({ data: { jobId: "11111111-1111-1111-1111-111111111111", status: "queued" }, error: null })
    .mockResolvedValueOnce({ data: { status: "ready", imageUrl: "https://example.com/scene.png" }, error: null });
  const url = await generateSceneImage({ focusText: "Ella cruza la calle" }, {
    renderLocal: async () => null,
    invoke: invoke as never,
    wait: async () => {},
  });
  expect(url).toBe("https://example.com/scene.png");
  expect(invoke).toHaveBeenLastCalledWith("illustrate-scene", {
    action: "status",
    jobId: "11111111-1111-1111-1111-111111111111",
  });
});

it("shows ComfyUI's failure instead of waiting", async () => {
  const invoke = vi.fn()
    .mockResolvedValueOnce({ data: { jobId: "11111111-1111-1111-1111-111111111111", status: "queued" }, error: null })
    .mockResolvedValueOnce({
      data: { status: "failed", message: "Falta el modelo de imagen en ComfyUI: flux.safetensors" },
      error: null,
    });
  await expect(generateSceneImage({}, {
    renderLocal: async () => null,
    invoke: invoke as never,
    wait: async () => {},
  })).rejects.toThrow(/Falta el modelo de imagen/);
});

it("says when ComfyUI never takes the illustration", async () => {
  const invoke = vi.fn(async () => ({
    data: { jobId: "11111111-1111-1111-1111-111111111111", status: "queued" },
    error: null,
  }));
  await expect(generateSceneImage({}, {
    renderLocal: async () => null,
    invoke: invoke as never,
    wait: async () => {},
    attempts: 1,
  })).rejects.toThrow(/ComfyUI no tomó la ilustración/);
});
