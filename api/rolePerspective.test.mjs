import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { rolePerspectiveLines } from './ai.mjs';

test('the same first-person claim stays with its actual speaker', () => {
  const story = { character_role: 'Persona que espera', player_role: 'Persona que llega' };
  const prompt = rolePerspectiveLines(story, [
    { role: 'assistant', content: 'Volví tarde.' },
    { role: 'user', content: 'Volví tarde.' },
  ], 'Yo volví tarde y tú me esperabas.').join('\n');
  assert.match(prompt, /"assistant":"Persona que espera","user":"Persona que llega"/);
  assert.match(prompt, /corrección prevalece/);
  const userQuotations = prompt.split('Últimos mensajes escritos por USER')[1].split('\n')[0];
  assert.equal((userQuotations.match(/Volví tarde\./g) || []).length, 1);
});

test('story-chat applies the role contract after remembered assistant claims', async () => {
  const saved = { NODE_ENV: process.env.NODE_ENV, VERCEL: process.env.VERCEL };
  const original = globalThis.fetch;
  let captured = '';
  try {
    process.env.NODE_ENV = 'development'; delete process.env.VERCEL;
    globalThis.fetch = async (url, init) => {
      if (String(url).includes('chat/completions')) {
        const body = JSON.parse(init.body);
        captured = body.messages[0].content;
        return Response.json({ choices: [{ message: { content: 'Me preocupé por ti al verte volver tan tarde.' } }] });
      }
      return Response.json({}, { status: 503 });
    };
    const res = { status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
    await handler({ method: 'POST', headers: {}, body: { action: 'story-chat', body: {
      story: { id: 'perspective-test', title: 'El regreso', character_role: 'Inés (compañera que esperaba)', player_role: 'Damián (compañero que llegó tarde)' },
      language: 'es', userMessage: 'Yo volví tarde. Tú me estabas esperando.',
      history: [{ role: 'assistant', content: 'Me preguntaste por qué tardé tanto.' }],
      memory: [{ role: 'assistant', content: 'Me preguntaste por qué tardé tanto.' }],
      settings: { modelId: 'mistral-nemo' },
    } } }, res);
    assert.equal(res.code, 200);
    assert.ok(captured.includes('PERSONAJE (Inés (compañera que esperaba)) dijo:'));
    assert.ok(captured.indexOf('PERSPECTIVAS Y AUTORÍA PARA ESTE TURNO') > captured.indexOf('CITAS DE ESTA SESIÓN'));
    assert.match(captured, /no demuestran que lo dicho fuera cierto/);
  } finally {
    globalThis.fetch = original;
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
