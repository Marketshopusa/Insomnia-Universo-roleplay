import { expect, it } from "vitest";
import { STORY_REGIONS, getStoryAccent, getStoryRegion, normalizeRegion, setStoryAccent, setStoryRegion, spokenRegion } from "./regions";
import { DEFAULT_VOICE, STORY_VOICES, getStoryVoice, normalizeStoryVoice, setStoryVoice } from "./voices";

it("lists the Gemini 2.5 Flash TTS voices and keeps scarlett-hd as Aoede", () => {
  expect(STORY_VOICES).toHaveLength(30);
  expect(STORY_VOICES.filter((voice) => voice.gender === "female")).toHaveLength(14);
  expect(STORY_VOICES.filter((voice) => voice.gender === "male")).toHaveLength(16);
  expect(STORY_VOICES.some((voice) => voice.value === "Charon")).toBe(true);
  expect(STORY_VOICES.some((voice) => voice.value === "Puck")).toBe(true);
  expect(STORY_VOICES.find((voice) => voice.value === "Aoede")?.formerName).toBe("Scarlett");
  expect(STORY_VOICES.find((voice) => voice.value === "Leda")?.formerName).toBe("Luna");
  expect(normalizeStoryVoice("scarlett-hd")).toBe("Aoede");
  expect(normalizeStoryVoice("Charon")).toBe("Charon");
  expect(normalizeStoryVoice("max-deep")).toBe("Charon");
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
  expect(getStoryAccent("story-1")).toBe(false);
  setStoryAccent("story-1", true);
  expect(getStoryAccent("story-1")).toBe(true);
  setStoryAccent("story-1", false);
  expect(getStoryAccent("story-1")).toBe(false);
  expect(spokenRegion("ve", false)).toBe("plain");
  expect(spokenRegion("ve", true)).toBe("ve");
});
