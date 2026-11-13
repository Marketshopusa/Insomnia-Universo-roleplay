import test from "node:test";
import assert from "node:assert/strict";
import handler, { cardIdentityLines, generateLocalLlama, generateNvidia, generationTimeout, storyVoiceLines } from "./ai.mjs";

test("card identity preserves supplied roles without inventing ages or professions", () => {
  const prompt = cardIdentityLines({ character_role: "Astrónomo", player_role: "Estudiante" }).join("\n");
  assert.match(prompt, /Personaje: Astrónomo/);
  assert.match(prompt, /Interlocutor: Estudiante/);
  assert.doesNotMatch(prompt, /25 años|44 años|DOCTORA|PACIENTE|MUJER|HOMBRE/);
});

test("an exhausted turn budget starts no further provider requests", async () => {
  let calls = 0;
  const content = await generateNvidia([], {
    apiKey: "test-key", models: ["first", "second"], deadlineMs: Date.now() - 1,
    fetchImpl: async () => { calls += 1; return Response.json({}); },
  });
  assert.equal(content, null);
  assert.equal(calls, 0);
  assert.throws(() => generationTimeout({ deadlineMs: Date.now() - 1 }), { code: "ai_timeout" });
  assert.ok(generationTimeout({ timeoutMs: 5000, deadlineMs: Date.now() + 1000 }) <= 1000);
});

test("local voice calls respect the requested short output limit", async () => {
  const vercel = process.env.VERCEL;
  delete process.env.VERCEL;
  try {
    let body;
    await generateLocalLlama([], { maxTokens: 55, fetchImpl: async (_url, init) => {
      body = JSON.parse(init.body);
      return Response.json({ choices: [{ message: { content: "Hola, te escucho bien." } }] });
    } });
    assert.equal(body.max_tokens, 55);
  } finally {
    if (vercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = vercel;
  }
});

test("a provider must never return a candidate rejected by validation", async () => {
  const content = await generateNvidia([], {
    apiKey: "test-key",
    models: ["test-provider"],
    fetchImpl: async () => Response.json({ choices: [{ message: { content: "Esta respuesta pertenece a otra escena." } }] }),
    validate: () => false,
  });
  assert.equal(content, null);
});

test("shared character instructions do not inject a medical scenario", () => {
  const prompt = storyVoiceLines("Carla", "Visitante", true, "español").join("\n");
  assert.doesNotMatch(prompt, /camilla|médica|paciente|revisando|examen/i);
});

test("provider failure returns an error rather than a scripted character turn", async () => {
  const previousFetch = globalThis.fetch;
  const previousEnv = { ...process.env };
  const calls = [];
  try {
    process.env.NODE_ENV = "development";
    delete process.env.VERCEL;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      return Response.json({ error: { message: "test provider unavailable" } }, { status: 503 });
    };
    const res = { status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
    await handler({ method: "POST", headers: {}, body: { action: "story-chat", body: {
      story: { id: "patio", title: "En el patio", description: "Carla conversa con una visita en el patio.", character_role: "Carla", player_role: "Visitante" },
      language: "es", userMessage: "¿Cómo va tu trabajo?", settings: { modelId: "mistral-nemo" },
      history: [{ role: "assistant", content: "*Te miro a los ojos con atención y una leve sonrisa, prestando atención a cada una de tus palabras.* Te escucho con total atención, Visitante. Cuéntame, continúa con lo que me estabas comentando." }],
    } } }, res);
    assert.ok(calls.length > 0);
    assert.equal(res.code, 503);
    assert.equal(res.data.error, "ai_unavailable");
    assert.equal(res.data.content, undefined);
  } finally {
    globalThis.fetch = previousFetch;
    for (const key of Object.keys(process.env)) if (!(key in previousEnv)) delete process.env[key];
    Object.assign(process.env, previousEnv);
  }
});
