import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { generateNvidia } from './ai.mjs';

test('a provider cutoff gets one bounded repair instead of being published as a complete reply', async () => {
  const requests = [];
  const messages = [{ role: 'system', content: 'Habla con naturalidad.' }, { role: 'user', content: '¿Qué necesitas?' }];
  const result = await generateNvidia(messages, { models: ['test'], apiKey: 'test', fetchImpl: async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return Response.json({ choices: [{ finish_reason: requests.length === 1 ? 'length' : 'stop', message: { content: requests.length === 1 ? 'Te llamé porque.' : 'Necesito tu firma en el permiso.' } }] });
  } });
  assert.equal(result, 'Necesito tu firma en el permiso.');
  assert.equal(requests.length, 2);
  assert.match(requests[1].messages[0].content, /REVISIÓN DE CALIDAD/);
  assert.equal(messages[0].content, 'Habla con naturalidad.');
});

test('reasoning content is never substituted for the spoken answer', async () => {
  const result = await generateNvidia([], { models: ['test'], apiKey: 'test', fetchImpl: async () =>
    Response.json({ choices: [{ finish_reason: 'length', message: { content: '', reasoning_content: 'Tengo que contestar sobre el permiso y recordar el papel del usuario.' } }] }) });
  assert.equal(result, null);
});

test('the endpoint preserves a finished thought without cutting its answer at the previous full stop', async () => {
  const saved = { NODE_ENV: process.env.NODE_ENV, VERCEL: process.env.VERCEL }, original = globalThis.fetch;
  const answer = 'Te estaba esperando en la oficina desde esta mañana. Necesito que firmes el permiso para poder presentar el proyecto mañana';
  try {
    process.env.NODE_ENV = 'development'; delete process.env.VERCEL;
    globalThis.fetch = async (url) => String(url).includes('chat/completions')
      ? Response.json({ choices: [{ finish_reason: 'stop', message: { content: answer } }] }) : Response.json({}, { status: 503 });
    const res = { status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
    await handler({ method: 'POST', headers: {}, body: { action: 'story-chat', body: {
      story: { id: 'neutral-presentation', title: 'La oficina', character_role: 'La colega', player_role: 'El compañero', description: 'La colega tiene un permiso que requiere una firma.' },
      language: 'es', userMessage: '¿Qué necesitas que haga?', history: [], settings: { modelId: 'mistral-nemo' },
    } } }, res);
    assert.equal(res.code, 200);
    assert.equal(res.data.content, answer);
  } finally {
    globalThis.fetch = original;
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
