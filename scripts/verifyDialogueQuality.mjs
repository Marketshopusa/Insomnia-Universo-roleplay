// Manual neutral conversations through the real endpoint and configured text provider.
import assert from 'node:assert/strict';
import handler from '../api/ai.mjs';
import { isIncompleteTurn } from '../src/lib/replyQuality.mjs';
import { isRepeatedTurn } from '../src/lib/conversationReply.mjs';
const saved = { NODE_ENV: process.env.NODE_ENV, VERCEL: process.env.VERCEL }, originalFetch = globalThis.fetch;
const story = { id: 'dialogue-quality-office', title: 'La oficina', character_role: 'Adela (colega)', player_role: 'Julián (compañero)', description: 'Adela esperaba a Julián en la oficina porque necesita su firma en el permiso para presentar el proyecto mañana. La carpeta está sobre la mesa. El permiso debe estar firmado antes de las ocho.' };
const history = [
  { role: 'user', content: '¿Para qué querías verme?' },
  { role: 'assistant', content: 'Te esperaba porque somos un equipo y porque trabajamos aquí juntos.' },
  { role: 'user', content: 'Pero ¿qué necesitas que haga?' },
  { role: 'assistant', content: 'Solo te esperaba porque somos un equipo.' },
];
try {
  process.env.NODE_ENV = 'development'; delete process.env.VERCEL;
  globalThis.fetch = (url, init) => String(url).includes('127.0.0.1:8788')
    ? Promise.reject(new Error('local backend excluded from cloud regression')) : originalFetch(url, init);
  const turns = [
    { user: 'Eso ya lo dijiste. ¿Para qué me estabas esperando? Dime concretamente qué necesitas de mí.', check: (text) => assert.match(text, /firm|permiso/iu) },
    { user: 'Dejemos eso para después. Ahora quiero cambiar de tema: ¿quieres café o té? Responde solamente a eso.', check: (text) => { assert.match(text, /café|té|agua/iu); assert.doesNotMatch(text, /firma|permiso|proyecto|ocho/iu); } },
    { user: '¿Dónde está el jefe ahora? No hemos hablado de dónde está.', check: (text) => assert.match(text, /no sé|no lo sé|no estoy segur|no me consta|no tengo|no sabría|no lo he visto|no he visto/iu) },
    { user: 'Sigo por teléfono. Dime en una frase qué documento falta firmar.', call: true, check: (text) => assert.match(text, /permiso/iu) },
  ];
  for (const turn of turns) {
    const res = { status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } }, started = Date.now();
    await handler({ method: 'POST', headers: {}, body: { action: 'story-chat', body: {
      story, language: 'es', history, userMessage: turn.user, isLiveCall: !!turn.call,
      settings: { modelId: 'magnum-v4-local', messageLength: 450 },
    } } }, res);
    assert.equal(res.code, 200, 'the neutral conversation failed');
    const text = res.data.content;
    assert.ok(text?.length > 8);
    assert.equal(isIncompleteTurn(text), false, 'a dangling thought reached the output');
    assert.equal(isRepeatedTurn(text, history, turn.user), false, 'the reply repeated the previous evasion');
    turn.check(text);
    console.log('DIALOGUE_QUALITY_CHECK', JSON.stringify({ turn: turns.indexOf(turn) + 1, call: !!turn.call, ms: Date.now() - started, reply: text }));
    history.push({ role: 'user', content: turn.user }, { role: 'assistant', content: text });
  }
} catch (error) {
  console.error('DIALOGUE_QUALITY_CHECK_FAILED', JSON.stringify({ code: error.code || error.name, message: String(error.message).slice(0, 200) }));
  process.exitCode = 1;
} finally {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
}
