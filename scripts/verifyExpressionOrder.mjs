// Manual real-provider check for a combined gesture and sound score.
import assert from 'node:assert/strict';
import { prepareExpressiveSpeech } from '../src/lib/expressiveSpeech.mjs';
import { synthesizeExpressiveScene } from '../src/lib/expressiveAudio.mjs';
import { synthesizeGemini } from '../api/_geminiTts.mjs';
try {
  const text = '«Hola». *Respiró profundo y sonrió* «Me alegra verte». *Camino hacia la ventana* «Mira afuera».';
  const score = prepareExpressiveSpeech(text, { roleplay: true });
  const emitted = [];
  const started = Date.now();
  const result = await synthesizeExpressiveScene(score, 'Kore', 'es', {
    region: 've', samples: () => null, cache: new Map(), deadlineMs: 45000,
    synthesize: synthesizeGemini,
    onAudio(pcm, segment) { emitted.push({ bytes: pcm.length, ...segment }); },
  });
  assert.equal(result.status, 200, 'expressive provider failed');
  assert.equal(result.parts[1].event, 'deep_breath');
  assert.ok(result.parts[1].endSample > result.parts[1].startSample, 'missing breath audio');
  assert.equal(emitted[0].narration, '', 'unexpected startup effect');
  assert.ok(emitted.some((segment) => segment.narration === 'Camino hacia la ventana'), 'missing action timing');
  assert.equal(score.segments.find((part) => part.text === '«Me alegra verte»').performance, 'warm');
  console.log('EXPRESSION_ORDER_CHECK', JSON.stringify({ voice: 'Kore', region: 've', ms: Date.now() - started, parts: result.parts, segments: emitted }));
} catch (error) {
  console.error('EXPRESSION_ORDER_CHECK_FAILED', JSON.stringify({ code: error.code || error.name, message: String(error.message).slice(0, 180) }));
  process.exitCode = 1;
}
