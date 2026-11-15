import { describe, expect, it, vi } from "vitest";
import {
  detectFoleyEvents,
  generateFoleyPcm,
  playFoley,
  scheduleFoleyForMessage,
  type FoleyType,
} from "./foleyStudio";

describe("Foley Studio Engine", () => {
  it("detects physical foley actions from roleplay text and stage directions", () => {
    const doorLock = detectFoleyEvents("*Cierra la puerta con seguro y me mira con deseo* Ven aquí.");
    expect(doorLock.some((e) => e.type === "door_lock")).toBe(true);

    const slap = detectFoleyEvents("*Le da una fuerte nalgada sonora haciéndola gemir* Pórtate bien.");
    expect(slap.some((e) => e.type === "flesh_impact")).toBe(true);

    const faceSlap = detectFoleyEvents("*Le cruza la cara con una bofetada* ¡Cállate!");
    expect(faceSlap.some((e) => e.type === "slap")).toBe(true);

    const zipper = detectFoleyEvents("*Baja el cierre de su pantalón lentamente* Mírame.");
    expect(zipper.some((e) => e.type === "zipper")).toBe(true);

    const sheets = detectFoleyEvents("*Se acomoda entre las sábanas de seda* Abrázame.");
    expect(sheets.some((e) => e.type === "sheets_rustle")).toBe(true);

    const bed = detectFoleyEvents("*El colchón cruje bajo su peso* No te muevas.");
    expect(bed.some((e) => e.type === "bed_creak")).toBe(true);

    const footsteps = detectFoleyEvents("*Pasos lentos se acercan por el pasillo* ¿Quién anda ahí?");
    expect(footsteps.some((e) => e.type === "footsteps")).toBe(true);

    const heartbeat = detectFoleyEvents("*Siente su corazón latiendo con fuerza* Estoy nerviosa.");
    expect(heartbeat.some((e) => e.type === "heartbeat")).toBe(true);
  });

  it("generates clean, finite, non-clipping PCM audio buffers for every Foley type", () => {
    const types: FoleyType[] = [
      "flesh_impact",
      "slap",
      "door_lock",
      "door_close",
      "door_slam",
      "zipper",
      "sheets_rustle",
      "bed_creak",
      "footsteps",
      "heartbeat",
      "pour_drink",
    ];

    for (const type of types) {
      const pcm = generateFoleyPcm(type, 24000);
      expect(pcm.length).toBeGreaterThan(1000);
      let maxAmp = 0;
      let hasNan = false;
      for (let i = 0; i < pcm.length; i++) {
        if (Number.isNaN(pcm[i])) hasNan = true;
        maxAmp = Math.max(maxAmp, Math.abs(pcm[i]));
      }
      expect(hasNan).toBe(false);
      expect(maxAmp).toBeGreaterThan(0.05);
      expect(maxAmp).toBeLessThanOrEqual(1.0);
    }
  });

  it("schedules Foley audio nodes in an AudioContext", () => {
    let played = 0;
    const mockContext: any = {
      sampleRate: 24000,
      currentTime: 1.5,
      destination: {},
      createBuffer: (_ch: number, len: number) => ({
        length: len,
        copyToChannel: vi.fn(),
      }),
      createGain: () => ({
        gain: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
      }),
      createBufferSource: () => ({
        buffer: null,
        connect: vi.fn(),
        start: () => { played++; },
      }),
    };

    const source = playFoley(mockContext, "flesh_impact", 1.5, 0.7);
    expect(source).not.toBeNull();
    expect(played).toBe(1);

    const scheduled = scheduleFoleyForMessage(
      mockContext,
      "*Cierra la puerta con seguro y me da una nalgada* Obedece.",
      1.5
    );
    expect(scheduled.length).toBeGreaterThanOrEqual(1);
  });
});
