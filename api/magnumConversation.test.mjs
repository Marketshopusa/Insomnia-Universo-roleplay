import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { sealMagnum, openMagnum, MAGNUM_PROFILE, MAGNUM_MODEL } from './_magnumProtocol.mjs';
import { requestMagnum } from './_magnumBridge.mjs';
import { magnumConversation, parseConversationReply, wordCount } from './_magnumConversation.mjs';
const secret = randomBytes(32).toString('base64');
const envelope = () => ({ id: 'request-1', profile: MAGNUM_PROFILE, expiresAt: Date.now() + 30000, content: 'Private conversation text' });
const body = () => ({ story: { character_role: 'Ana (colega)', player_role: 'Una visita', description: 'Dos colegas conversan sobre un proyecto.' }, userMessage: 'Estoy preparando una presentación. ¿Cómo puedo organizar mis ideas?', language: 'es', settings: { modelId: MAGNUM_PROFILE } });
const reaction = 'Te escucho con atención y acerco una silla para que podamos revisar las ideas con calma.';
const dialogue = 'Podemos empezar por lo que quieres que recuerde el público cuando termine la presentación. Después elegimos tres ideas principales y buscamos un ejemplo claro para cada una. Así tendrás un recorrido fácil de seguir, sin intentar contarlo todo de golpe. Si quieres, esta tarde podemos ensayar juntos la introducción y comprobar cuánto tarda cada parte. También conviene reservar unos minutos para las preguntas. ¿Cuál es la idea que más te interesa transmitir y qué parte te está costando explicar con claridad ahora mismo?';
const modelReply = JSON.stringify({ reaction, dialogue });

test('relay packets conceal content and authenticate their direction and expiry', () => {
  const value = envelope(), packet = sealMagnum(value, 'request', secret);
  assert.ok(!JSON.stringify(packet).includes(value.content));
  assert.deepEqual(openMagnum(packet, 'request', secret), value);
  assert.throws(() => openMagnum(packet, 'response', secret));
  assert.throws(() => openMagnum(packet, 'request', randomBytes(32).toString('base64')));
  assert.throws(() => openMagnum(packet, 'request', secret, value.expiresAt + 1));
  assert.throws(() => openMagnum({ ...packet, data: packet.data.slice(0, -4) + 'AAAA' }, 'request', secret));
});

test('the relay ignores forged and unrelated replies and closes its connection', async () => {
  let receive, closed = 0;
  const channel = { on(_type, _filter, fn) { receive = fn; return this; }, subscribe(fn) { queueMicrotask(() => fn('SUBSCRIBED')); },
    async send(event) {
      const request = openMagnum(event.payload, 'request', secret);
      receive({ payload: { v: 1, data: 'forged' } });
      receive({ payload: sealMagnum({ ...envelope(), id: 'another-job', model: 'wrong' }, 'response', secret) });
      receive({ payload: sealMagnum({ ...request, model: MAGNUM_MODEL, content: modelReply }, 'response', secret) });
      return 'ok';
    } };
  const result = await requestMagnum({ kind: 'generate' }, { secret, timeoutMs: 1000, clientFactory: () => ({ channel: () => channel, async removeAllChannels() { closed++; }, realtime: { disconnect() { closed++; } } }) });
  assert.equal(result.model, MAGNUM_MODEL);
  assert.equal(closed, 2);
});

test('the selected non-explicit route has no inference call when input is disallowed', async () => {
  let calls = 0;
  await assert.rejects(magnumConversation(body(), { classify: async () => ({ allowed: false }), bridge: async () => { calls++; } }), { code: 'non_explicit_only' });
  await assert.rejects(magnumConversation({ ...body(), adultMode: true }, { classify: async () => ({ allowed: true }), bridge: async () => { calls++; } }), { code: 'non_explicit_only' });
  assert.equal(calls, 0);
});

test('only verified Magnum output with reaction and dialogue can be published', async () => {
  const checks = [];
  const result = await magnumConversation(body(), { classify: async (value) => { checks.push(value.kind); return { allowed: true, length: 'standard' }; }, bridge: async () => ({ model: MAGNUM_MODEL, content: modelReply }) });
  assert.deepEqual(checks, ['input', 'output']);
  assert.equal(result.engine.model, MAGNUM_MODEL);
  assert.equal(result.engine.fallback, false);
  assert.ok(result.words >= 90 && result.words <= 150);
  assert.ok(result.content.startsWith('*' + reaction + '*'));
  assert.ok(result.content.endsWith(dialogue));
});

test('an unsafe output is blocked instead of retried or sent to another model', async () => {
  let calls = 0;
  await assert.rejects(magnumConversation(body(), { classify: async (value) => ({ allowed: value.kind === 'input', length: 'standard' }), bridge: async () => { calls++; return { model: MAGNUM_MODEL, content: modelReply }; } }), { code: 'non_explicit_only' });
  assert.equal(calls, 1);
});

test('a different model never masquerades as Magnum and offline failures have no fallback', async () => {
  const classify = async () => ({ allowed: true });
  await assert.rejects(magnumConversation(body(), { classify, bridge: async () => ({ model: 'another-model', content: modelReply }) }), { code: 'magnum_model_mismatch' });
  await assert.rejects(magnumConversation(body(), { classify, bridge: async () => { throw Object.assign(new Error('offline'), { code: 'magnum_offline' }); } }), { code: 'magnum_offline' });
});

test('one bounded correction restores both components and the word range', async () => {
  let calls = 0;
  const result = await magnumConversation(body(), { classify: async () => ({ allowed: true, length: 'standard' }), bridge: async () => ({ model: MAGNUM_MODEL, content: ++calls === 1 ? JSON.stringify({ reaction: '', dialogue: 'Hola.' }) : modelReply }) });
  assert.equal(calls, 2);
  assert.equal(result.words, wordCount(result.content));
  assert.equal(parseConversationReply(JSON.stringify({ reaction: 'Te miro.', dialogue: 'Te esperaba porque.' })), null);
});

test('simple exchanges can be shorter while retaining a reaction and dialogue', async () => {
  const raw = JSON.stringify({ reaction: 'Sonrío y dejo la taza sobre la mesa.', dialogue: 'Sí, un café me vendría bien. Si puedes, lo prefiero sin azúcar y con un poco de leche, gracias por preguntar.' });
  const result = await magnumConversation({ ...body(), userMessage: '¿Quieres un café?' }, { classify: async () => ({ allowed: true, length: 'brief' }), bridge: async () => ({ model: MAGNUM_MODEL, content: raw }) });
  assert.ok(result.words < 90);
  assert.ok(result.words >= 20);
});

test('a disallowed short output is blocked before any length repair', async () => {
  let calls = 0;
  await assert.rejects(magnumConversation(body(), { classify: async (value) => ({ allowed: value.kind === 'input', length: 'standard' }), bridge: async () => { calls++; return { model: MAGNUM_MODEL, content: JSON.stringify({ reaction: 'Breve reacción.', dialogue: 'Respuesta breve.' }) }; } }), { code: 'non_explicit_only' });
  assert.equal(calls, 1);
});

test('a short phone confirmation can stay brief while retaining both components', async () => {
  const result = await magnumConversation({ ...body(), isLiveCall: true, userMessage: 'Confírmalo brevemente.' }, { classify: async () => ({ allowed: true, length: 'brief' }), bridge: async () => ({ model: MAGNUM_MODEL, content: JSON.stringify({ reaccion: 'Asiento.', dialogo: 'Sí, esta tarde.' }) }) });
  assert.equal(result.words, 4);
});

test('a language drift is corrected by the same Magnum engine', async () => {
  let calls = 0;
  const result = await magnumConversation(body(), { classify: async () => ({ allowed: true, length: 'standard' }), bridge: async () => ({ model: MAGNUM_MODEL, content: ++calls === 1 ? JSON.stringify({ reaction: 'I listen to you with a calm smile.', dialogue: 'I would be glad to help you with your work today.' }) : modelReply }) });
  assert.equal(calls, 2);
  assert.equal(result.engine.model, MAGNUM_MODEL);
  assert.equal(parseConversationReply(JSON.stringify({ reaction: 'Asiento.', dialogue: '*Miro la mesa*' })), null);
});
