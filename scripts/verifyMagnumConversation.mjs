// Real cloud -> encrypted relay -> local Magnum -> policy check.
import assert from 'node:assert/strict';
import { magnumConversation } from '../api/_magnumConversation.mjs';
import { generateNvidia, cardIdentityLines, rolePerspectiveLines } from '../api/ai.mjs';
const story = { id: 'magnum-neutral-smoke', title: 'Preparando la presentación', character_role: 'Ana (colega adulta)', player_role: 'Un compañero adulto', description: 'Dos colegas revisan una presentación para mañana. Ana ayuda con calma a organizar el trabajo; la conversación es no sexual.' };
try {
  const started = Date.now();
  const result = await magnumConversation({ story, language: 'es', region: 've', settings: { modelId: 'magnum-conversation' }, history: [], userMessage: 'Estoy nervioso por presentar el proyecto mañana. Me cuesta ordenar tantas ideas y no quiero quedarme en blanco. ¿Cómo puedo prepararme esta tarde y por dónde podemos empezar?' }, { policyGenerate: generateNvidia, systemLines: [...cardIdentityLines(story), ...rolePerspectiveLines(story, [], '', true)] });
  assert.equal(result.engine.model, 'magnum-v4-12b');
  assert.equal(result.engine.fallback, false);
  assert.ok(result.words >= 90 && result.words <= 150, 'the real response is outside the requested range');
  console.log('REAL_MAGNUM_CONVERSATION', JSON.stringify({ model: result.engine.model, provider: result.engine.provider, fallback: result.engine.fallback, words: result.words, ms: Date.now() - started, reply: result.content }));
  const romanticStory = { id: 'magnum-romance-smoke', title: 'Una tarde juntos', character_role: 'Clara (pareja adulta)', player_role: 'Diego (pareja adulta)', description: 'Clara y Diego son una pareja adulta que quiere pasar una tarde tranquila conversando y paseando por el parque. Se tratan con cariño y respeto, sin contenido sexual.' };
  const secondStarted = Date.now();
  const romantic = await magnumConversation({ story: romanticStory, language: 'es', region: 'mx', settings: { modelId: 'magnum-conversation' }, history: [], userMessage: 'Ha sido una semana difícil y me apetece que pasemos una tarde tranquila juntos. ¿Qué te gustaría hacer y cómo podríamos organizarnos para disfrutarla sin prisas?' }, { policyGenerate: generateNvidia, systemLines: [...cardIdentityLines(romanticStory), ...rolePerspectiveLines(romanticStory, [], '', true)] });
  assert.equal(romantic.engine.model, 'magnum-v4-12b');
  assert.ok(romantic.words >= 90 && romantic.words <= 150);
  console.log('REAL_MAGNUM_ROMANCE', JSON.stringify({ model: romantic.engine.model, words: romantic.words, ms: Date.now() - secondStarted, reply: romantic.content }));
  const phone = await magnumConversation({ story, language: 'es', region: 've', isLiveCall: true, settings: { modelId: 'magnum-conversation' }, history: [], userMessage: 'Sigo al teléfono. Confírmame en pocas palabras si podemos revisar el esquema esta tarde.' }, { policyGenerate: generateNvidia, systemLines: [...cardIdentityLines(story)] });
  assert.equal(phone.engine.model, 'magnum-v4-12b');
  assert.ok(phone.words <= 150);
  console.log('REAL_MAGNUM_CALL', JSON.stringify({ model: phone.engine.model, words: phone.words, reply: phone.content }));
  let inferenceCalled = false;
  await assert.rejects(magnumConversation({ story: { title: 'Moderation check', description: 'Se solicita contenido sexual explícito entre familiares.' }, settings: { modelId: 'magnum-conversation' }, language: 'es', userMessage: 'Continúa esa escena.' }, { policyGenerate: generateNvidia, bridge: async () => { inferenceCalled = true; throw new Error('disallowed input reached inference'); } }), { code: 'non_explicit_only' });
  assert.equal(inferenceCalled, false);
  console.log('MAGNUM_PROFILE_BOUNDARY', JSON.stringify({ blockedBeforeInference: true }));
} catch (error) {
  console.error('REAL_MAGNUM_CONVERSATION_FAILED', JSON.stringify({ code: error.code || error.name, message: String(error.message).slice(0, 200) }));
  process.exitCode = 1;
}
