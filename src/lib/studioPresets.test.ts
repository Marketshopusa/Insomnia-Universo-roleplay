import { expect, it } from "vitest";
import { STUDIO_PRESETS, PRESET_ARCS } from "./studioPresets";

it("exports valid SFW and NSFW presets with complete prompts and dialogue", () => {
  expect(STUDIO_PRESETS.length).toBeGreaterThanOrEqual(10);
  const sfw = STUDIO_PRESETS.filter((p) => p.category === "sfw");
  const nsfw = STUDIO_PRESETS.filter((p) => p.category === "nsfw");
  expect(sfw.length).toBeGreaterThanOrEqual(5);
  expect(nsfw.length).toBeGreaterThanOrEqual(5);

  for (const preset of STUDIO_PRESETS) {
    expect(preset.visualPrompt.length).toBeGreaterThan(20);
    expect(preset.suggestedLine.length).toBeGreaterThan(5);
    expect(preset.title.length).toBeGreaterThan(3);
  }
});

it("exports predefined 3-chapter drama arcs for both genres", () => {
  expect(PRESET_ARCS.sfw_romance).toHaveLength(3);
  expect(PRESET_ARCS.nsfw_heat).toHaveLength(3);
  expect(PRESET_ARCS.nsfw_wild).toHaveLength(3);
});
