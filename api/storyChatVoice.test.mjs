import test from "node:test";
import assert from "node:assert/strict";
import { lockedStoryFacts, storyContinuityLines, storyVoiceLines } from "./ai.mjs";

test("a video stays with the person who sent it", () => {
  const facts = lockedStoryFacts([
    { role: "model", text: "Te envié un video mío, de mí sola." },
    { role: "user", text: "Luego te digo qué voy a hacer con tu video." },
    { role: "model", text: "Hoy hace calor." },
  ], "Andrea", "William");
  assert.deepEqual(facts, [
    "Andrea: Te envié un video mío, de mí sola.",
    "William: Luego te digo qué voy a hacer con tu video.",
  ]);
  const rules = storyContinuityLines(true).join("\n");
  assert.match(rules, /sigue siendo suyo/);
  assert.match(rules, /No inventes una pareja/);
});

test("every chat keeps the same memory and does not restart the story", () => {
  const lines = storyContinuityLines(true).join("\n");
  assert.match(lines, /todo chat, nuevo o ya empezado/);
  assert.match(lines, /no disocies la conversación/);
  assert.match(lines, /memoria de lo que pasó/);
  assert.match(lines, /palabras nuevas/);
});

test("the character owns what the user says she did", () => {
  const lines = storyVoiceLines("Andrea", "William", true, "español").join("\n");
  assert.match(lines, /conversación real/);
  assert.match(lines, /esa acción es tuya/);
  assert.match(lines, /te equivocaste al enviarlo/);
  assert.match(lines, /No digas que tú también lo viste/);
  assert.match(lines, /disculpa nueva/);
  assert.doesNotMatch(lines, /220 caracteres/);
});

test("an English scene keeps the same ownership rule", () => {
  const lines = storyVoiceLines("Andrea", "William", false, "inglés").join("\n");
  assert.match(lines, /that action is yours/);
  assert.match(lines, /sent it to the wrong person/);
  assert.match(lines, /Do not say you also watched it/);
});
