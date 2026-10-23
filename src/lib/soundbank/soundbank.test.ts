import { describe, it, expect } from "vitest";
import { detectSoundEvents } from "./matcher";
import { generateSoundPcm } from "./audioSynthesizer";
import type { SoundId } from "./types";

describe("Cinematic Soundbank Engine", () => {
  it("detects complex multi-layer scene audio from user narrative", () => {
    const userScene = "La toma con fuerza contra la pared pegandola contra la pared mientras se escuchan los sonidos De la lluvia, ella suelta un pequeño gemido Y golpea sus manos contra la pared mientras él la toma y la pega más contra él Escuchando Ese pequeño gemido que escapa de sus labios mientras él la sostiene con fuerza y de pronto La aprieta con fuerza, sacándole un poco la respiración mientras la música del salón está muy suave";

    const events = detectSoundEvents(userScene);
    const soundIds = events.map((e) => e.soundId);

    // Debe detectar el impacto en la pared
    expect(soundIds).toContain("wall_slam");
    // Debe detectar la lluvia
    expect(soundIds).toContain("rain_window");
    // Debe detectar el gemido
    expect(soundIds.some((id) => id === "moan_pleasure" || id === "moan_subtle")).toBe(true);
    // Debe detectar la falta de aire / sofoco
    expect(soundIds).toContain("gasp_breathless");
    // Debe detectar la música suave del salón
    expect(soundIds).toContain("salon_music");
  });

  it("never hallucinates random sounds on unrelated dialogue", () => {
    const cleanDialogue = "Hola, tío. Me alegra mucho verte hoy. ¿Cómo ha estado tu día?";
    const events = detectSoundEvents(cleanDialogue);
    expect(events.length).toBe(0);
  });

  it("generates valid PCM buffers for all catalogued sound IDs", () => {
    const testIds: SoundId[] = [
      "wall_slam",
      "flesh_impact",
      "slap",
      "bed_creak",
      "fabric_sheets",
      "zipper",
      "footsteps_heels",
      "footsteps_normal",
      "door_slam",
      "door_lock",
      "glasses_clink",
      "pour_liquid",
      "applause",
      "rain_window",
      "thunder_storm",
      "wind_night",
      "salon_music",
      "gasp_breathless",
      "pant_running",
      "moan_pleasure",
      "moan_subtle",
      "scream_pleasure",
      "scream_pain",
      "cry_deep",
      "guttural_groan",
      "kiss_wet",
      "laugh_burst",
      "laugh_chuckle",
    ];

    for (const id of testIds) {
      const pcm = generateSoundPcm(id, 24000);
      expect(pcm.length).toBeGreaterThan(500);
      expect(pcm instanceof Float32Array).toBe(true);
      // Validar que no hay NaN o infinitos
      expect(Number.isFinite(pcm[0])).toBe(true);
    }
  });
});
