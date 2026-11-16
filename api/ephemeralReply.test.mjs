import test from 'node:test';
import assert from 'node:assert/strict';

test('generation failure returns an error instead of a scripted scene', async () => {
  const originalFetch = globalThis.fetch;
  const originalEnvironment = { NODE_ENV: process.env.NODE_ENV, VERCEL: process.env.VERCEL };
  process.env.NODE_ENV = 'test'; delete process.env.VERCEL;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ error: { message: 'Injected provider outage' } }), { status: 503 }); };
  try {
    const { default: handler } = await import('./ai.mjs');
    let status, payload;
    const response = { status(code) { status = code; return this; }, json(data) { payload = data; return this; }, setHeader() {} };
    await handler({ method: 'POST', headers: {}, socket: { remoteAddress: 'test-reset-outage' }, body: { action: 'story-chat', body: { story: { id: 'qa-outage', title: 'Consulta de archivos', description: 'Una bibliotecaria organiza documentos.', character_role: 'Ana', player_role: 'Visitante' }, userMessage: 'Hola. Busco un libro.', language: 'es', history: [], settings: { modelId: 'insomnia-flash', nvidiaApiKey: 'test-key', messageLength: 300 } } } }, response);
    assert.equal(status, 503);
    assert.equal(payload.error, 'ai_unavailable');
    assert.equal(payload.content, undefined);
    assert.ok(calls > 0);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnvironment)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
