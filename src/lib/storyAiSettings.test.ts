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

it('uses real Magnum for factory non-explicit conversations while preserving card choices', async () => {
  const { DEFAULT_MOTHER_CARD, getMotherCardConfig } = await import('./roleplayBase');
  localStorage.setItem('insomnia_mother_card_config_v2', JSON.stringify({ ...DEFAULT_MOTHER_CARD, version: 6, aiSettings: { ...DEFAULT_AI_SETTINGS, modelId: 'insomnia-flash' } }));
  expect(getStoryAiSettings('fresh').modelId).toBe('magnum-conversation');
  expect(getMotherCardConfig().aiSettings.modelId).toBe('magnum-conversation');
  setStoryAiSettings('custom', { ...DEFAULT_AI_SETTINGS, modelId: 'mistral-nemo' });
  expect(getStoryAiSettings('custom').modelId).toBe('mistral-nemo');
});

it('keeps a customized mother card model unchanged', async () => {
  const { DEFAULT_MOTHER_CARD } = await import('./roleplayBase');
  localStorage.setItem('insomnia_mother_card_config_v2', JSON.stringify({ ...DEFAULT_MOTHER_CARD, version: 6, masterDirective: 'Mi directiva de astronomía.', aiSettings: { ...DEFAULT_AI_SETTINGS, modelId: 'mistral-nemo' } }));
  expect(getStoryAiSettings('custom-mother').modelId).toBe('mistral-nemo');
});


it('upgrades the old non-adult default once and respects subsequent choices', () => {
  localStorage.setItem('insomnia_story_ai_settings_old-card', JSON.stringify({ ...DEFAULT_AI_SETTINGS, modelId: 'insomnia-flash', customDirective: 'Habla de astronomía.' }));
  localStorage.setItem('insomnia_story_ai_settings_adult-card', JSON.stringify({ ...DEFAULT_AI_SETTINGS, modelId: 'insomnia-flash', adultMode: true }));
  expect(getStoryAiSettings('old-card').modelId).toBe('magnum-conversation');
  expect(getStoryAiSettings('old-card').customDirective).toBe('Habla de astronomía.');
  expect(getStoryAiSettings('adult-card').modelId).toBe('insomnia-flash');
  setStoryAiSettings('old-card', { ...getStoryAiSettings('old-card'), modelId: 'insomnia-flash' });
  expect(getStoryAiSettings('old-card').modelId).toBe('insomnia-flash');
});

it('an explicit non-explicit Magnum selection applies only to its own card', async () => {
  const { isMagnumConversationSelected } = await import('./storyAiSettings');
  setStoryAiSettings('chosen', { ...DEFAULT_AI_SETTINGS, modelId: 'magnum-conversation', adultMode: true });
  expect(isMagnumConversationSelected('chosen')).toBe(true);
  expect(getStoryAiSettings('chosen').adultMode).toBe(false);
  expect(isMagnumConversationSelected('other')).toBe(false);
  setStoryAiSettings('chosen', { ...getStoryAiSettings('chosen'), modelId: 'insomnia-flash' });
  expect(isMagnumConversationSelected('chosen')).toBe(false);
});
