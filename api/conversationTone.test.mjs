import test from 'node:test';
import assert from 'node:assert/strict';
import { slangInstruction } from './_regions.mjs';
import { conversationToneLines } from './ai.mjs';

test('regional writing follows the selected country without compulsory catchphrases', () => {
  assert.match(slangInstruction('es', 've'), /Venezuela/);
  assert.match(slangInstruction('es', 'mx'), /México/);
  assert.equal(slangInstruction('es', 'plain'), '');
  assert.equal(slangInstruction('en', 've'), '');
});
test('emotional progression can ease back and is not based on message counts', () => {
  const prompt = conversationToneLines(true).join('\n');
  assert.match(prompt, /no aumentan por contar mensajes/);
  assert.match(prompt, /reduce la intensidad/);
  assert.match(prompt, /No presupongas atracción/);
});
