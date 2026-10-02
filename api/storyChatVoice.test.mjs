import test from "node:test";
import assert from "node:assert/strict";
import { storyVoiceLines } from "./ai.mjs";

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
