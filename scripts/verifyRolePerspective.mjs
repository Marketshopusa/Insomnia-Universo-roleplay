// Manual regression against the actual story-chat handler and configured text provider.
import assert from 'node:assert/strict';
import handler from '../api/ai.mjs';
const originalFetch = globalThis.fetch;
const saved = { NODE_ENV: process.env.NODE_ENV, VERCEL: process.env.VERCEL };
try {
  // This in-process test harness has no HTTP user session. Endpoint auth is tested separately.
  process.env.NODE_ENV = 'development';
  delete process.env.VERCEL;
  globalThis.fetch = (url, init) => String(url).includes("127.0.0.1:8788")
    ? Promise.reject(new Error("local backend excluded from cloud regression")) : originalFetch(url, init);
  const cases = [
    {
      story: { id: 'test-perspective-waiting', title: 'El regreso', character_role: 'Lucía (hermana adulta)', player_role: 'Andrés (hermano mayor adulto)', description: 'Lucía esperaba preocupada y algo molesta en la sala a su hermano Andrés, que volvió tarde.' },
      history: [
        { role: 'assistant', content: 'Me tenías preocupada. ¿Por qué llegaste tan tarde?' },
        { role: 'user', content: 'Tú eres quien me cuida y me espera cuando vuelvo.' },
        { role: 'assistant', content: 'Me molesta que me regañes por algo tan simple.' },
      ],
      latest: '¿Qué dices que te regañé? ¿De qué estás hablando?',
      rejects: /\b(?:yo llegué tarde|tardé tanto|me preguntaste por qué tardé|me estabas esperando)\b/iu,
    },
    {
      story: { id: 'test-perspective-arriving', title: 'La espera', character_role: 'Raúl (compañero que volvió tarde)', player_role: 'Elena (compañera que lo esperaba)', description: 'Raúl vuelve tarde a la oficina. Elena lo esperaba preocupada para cerrar juntos.' },
      history: [{ role: 'user', content: 'Te estaba esperando, me preocupé. ¿Por qué tardaste?' }],
      latest: 'Yo me quedé aquí esperándote. Dime qué ocurrió.',
      rejects: /\b(?:te estaba esperando|me preocupé por tu retraso|llegaste tarde)\b/iu,
    },
  ];
  for (const item of cases) {
    const started = Date.now();
    const res = { status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
    await handler({ method: 'POST', headers: {}, body: { action: 'story-chat', body: {
      story: item.story, language: 'es', history: item.history, userMessage: item.latest,
      settings: { modelId: 'insomnia-flash', messageLength: 300 },
    } } }, res);
    assert.equal(res.code, 200, 'story-chat did not complete');
    assert.ok(res.data.content?.length > 10, 'no character reply');
    assert.doesNotMatch(res.data.content, item.rejects, 'the response swapped the established actors');
    console.log('ROLE_PERSPECTIVE_CHECK', JSON.stringify({ id: item.story.id, ms: Date.now() - started, reply: res.data.content }));
  }
} catch (error) {
  console.error('ROLE_PERSPECTIVE_CHECK_FAILED', JSON.stringify({ code: error.code || error.name, message: String(error.message).slice(0, 200) }));
  process.exitCode = 1;
} finally {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}
