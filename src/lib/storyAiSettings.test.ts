import { beforeEach, expect, it } from "vitest";
import { DEFAULT_AI_SETTINGS, getStoryAiSettings, setStoryAiSettings } from "./storyAiSettings";
import { saveMotherCardConfig } from "./roleplayBase";

beforeEach(() => localStorage.clear());

it("a card's custom instructions never become another card's defaults", () => {
  setStoryAiSettings("card-a", { ...DEFAULT_AI_SETTINGS, customDirective: "Habla de astronomía.", messageLength: 650 });
  expect(getStoryAiSettings("card-a").customDirective).toBe("Habla de astronomía.");
  expect(getStoryAiSettings("card-b").customDirective).not.toBe("Habla de astronomía.");
  expect(getStoryAiSettings("card-b").messageLength).toBe(DEFAULT_AI_SETTINGS.messageLength);
});

it("only an explicit global save changes shared defaults", () => {
  setStoryAiSettings(null, { ...DEFAULT_AI_SETTINGS, messageLength: 600 });
  setStoryAiSettings("card-a", { ...getStoryAiSettings("card-a"), messageLength: 700 });
  expect(getStoryAiSettings("card-b").messageLength).toBe(600);
  expect(getStoryAiSettings("card-a").messageLength).toBe(700);
});

it("legacy global settings cannot propagate another card's script", () => {
  localStorage.setItem("insomnia_story_ai_settings_global", JSON.stringify({ customDirective: "Habla de astronomía." }));
  expect(getStoryAiSettings("card-b").customDirective).not.toBe("Habla de astronomía.");
});

it("updating the mother card preserves explicit per-card overrides", () => {
  setStoryAiSettings("card-a", { ...DEFAULT_AI_SETTINGS, customDirective: "Habla de astronomía.", messageLength: 650 });
  saveMotherCardConfig({ aiSettings: { ...DEFAULT_AI_SETTINGS, messageLength: 500 } });
  expect(getStoryAiSettings("card-a").customDirective).toBe("Habla de astronomía.");
  expect(getStoryAiSettings("card-a").messageLength).toBe(650);
  expect(getStoryAiSettings("card-b").messageLength).toBe(500);
});
