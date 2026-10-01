import { expect, it } from "vitest";
import { STORY_REGIONS, getStoryRegion, normalizeRegion, setStoryRegion } from "./regions";
import { DEFAULT_VOICE, STORY_VOICES, getStoryVoice, normalizeStoryVoice, setStoryVoice } from "./voices";

it("lists the 14 feminine Chirp voices and keeps scarlett-hd as Aoede", () => {
  expect(STORY_VOICES).toHaveLength(14);
  expect(STORY_VOICES.map((voice) => voice.value)).toEqual([
    "Aoede", "Zephyr", "Leda", "Kore", "Achernar", "Autonoe", "Callirrhoe",
    "Despina", "Erinome", "Gacrux", "Laomedeia", "Pulcherrima", "Sulafat", "Vindemiatrix",
  ]);
  expect(STORY_VOICES.every((voice) => voice.gender === "female")).toBe(true);
  expect(STORY_VOICES.some((voice) => /charon|puck/i.test(voice.value))).toBe(false);
  expect(normalizeStoryVoice("scarlett-hd")).toBe("Aoede");
  expect(normalizeStoryVoice("Charon")).toBe(DEFAULT_VOICE);
  localStorage.setItem("insomnia.voice.story-1", "scarlett-hd");
  expect(getStoryVoice("story-1")).toBe("Aoede");
  setStoryVoice("story-1", "Leda");
  expect(localStorage.getItem("insomnia.voice.story-1")).toBe("Leda");
});

it("stores the story accent beside the voice and defaults to México", () => {
  expect(STORY_REGIONS.map((region) => region.id)).toEqual(["ar", "ve", "co", "mx", "es", "cl"]);
  expect(normalizeRegion(null)).toBe("mx");
  expect(normalizeRegion("es")).toBe("es");
  setStoryRegion("story-1", "cl");
  expect(localStorage.getItem("insomnia.region.story-1")).toBe("cl");
  expect(getStoryRegion("story-1")).toBe("cl");
  localStorage.clear();
  expect(getStoryRegion("other")).toBe("mx");
});
