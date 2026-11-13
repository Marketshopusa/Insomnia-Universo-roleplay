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

it('recovers the Gemini default and mother settings after the withdrawn profile migration', async () => {
  localStorage.setItem('insomnia_mother_card_config_v2', JSON.stringify({ version: 7, masterDirective: 'Conserva mi directiva.', aiSettings: { modelId: 'magnum-conversation', adultMode: false, messageLength: 620 } }));
  const {getMotherCardConfig} = await import('./roleplayBase');
  expect(DEFAULT_AI_SETTINGS.modelId).toBe('insomnia-flash');
  expect(getMotherCardConfig().aiSettings.modelId).toBe('insomnia-flash');
  expect(getMotherCardConfig().masterDirective).toBe('Conserva mi directiva.');
  expect(getStoryAiSettings('fresh').messageLength).toBe(620);
});
it('recovers stored cards without discarding settings or forcing adult mode off', () => {
  localStorage.setItem('insomnia_story_ai_settings_affected', JSON.stringify({ modelId: 'magnum-conversation', adultMode: true, nonExplicitConversation: true, customDirective: 'Conserva mi texto.', memoryTier: '32k' }));
  const value = getStoryAiSettings('affected');
  expect(value.modelId).toBe('insomnia-flash');
  expect(value.adultMode).toBe(true);
  expect(value.customDirective).toBe('Conserva mi texto.');
  expect(value.memoryTier).toBe('32k');
  expect(localStorage.getItem('insomnia_story_ai_settings_affected')).not.toContain('nonExplicitConversation');
});
it('saving settings preserves the selected adult flag', () => {
  setStoryAiSettings('card', { ...DEFAULT_AI_SETTINGS, adultMode: true });
  expect(getStoryAiSettings('card').adultMode).toBe(true);
  setStoryAiSettings('card', { ...getStoryAiSettings('card'), adultMode: false });
  expect(getStoryAiSettings('card').adultMode).toBe(false);
});
it('recovery preserves custom models and prevents the withdrawn forward migration', () => {
  localStorage.setItem('insomnia_story_ai_settings_custom', JSON.stringify({ modelId: 'mistral-nemo', adultMode: false, customDirective: 'Texto propio.' }));
  expect(getStoryAiSettings('custom').modelId).toBe('mistral-nemo');
  expect(getStoryAiSettings('custom').customDirective).toBe('Texto propio.');
  expect(localStorage.getItem('insomnia_magnum_conversation_primary_v1')).toBe('1');
  setStoryAiSettings('custom', { ...getStoryAiSettings('custom'), modelId: 'insomnia-flash' });
  expect(getStoryAiSettings('custom').modelId).toBe('insomnia-flash');
});
