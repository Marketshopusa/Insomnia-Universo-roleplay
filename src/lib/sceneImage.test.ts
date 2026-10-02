import { expect, it, vi } from "vitest";
import { generateSceneImage } from "./sceneImage";

it("uses the ComfyUI image on this computer and does not call the cloud", async () => {
  const invoke = vi.fn();
  const url = await generateSceneImage({ focusText: "Ella cruza la calle de noche" }, {
    renderLocal: async () => "data:image/png;base64,abc",
    invoke: invoke as never,
  });
  expect(url).toBe("data:image/png;base64,abc");
  expect(invoke).not.toHaveBeenCalled();
});

it("returns the picture drawn on the server", async () => {
  const invoke = vi.fn(async () => ({
    data: { status: "ready", imageUrl: "data:image/png;base64,server" },
    error: null,
  }));
  const url = await generateSceneImage({ focusText: "Ella cruza la calle de noche" }, {
    renderLocal: async () => null,
    invoke: invoke as never,
  });
  expect(url).toBe("data:image/png;base64,server");
  expect(invoke).toHaveBeenCalledOnce();
});

it("shows the server error instead of waiting for a computer", async () => {
  const invoke = vi.fn(async () => ({
    data: { error: "scene_draw_failed", message: "Gemini no entregó la imagen de esta escena." },
    error: { message: "Gemini no entregó la imagen de esta escena." },
  }));
  await expect(generateSceneImage({ focusText: "Ella cruza la calle de noche" }, {
    renderLocal: async () => null,
    invoke: invoke as never,
  })).rejects.toThrow(/no entregó la imagen/);
});
