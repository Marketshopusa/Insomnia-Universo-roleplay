import test from "node:test";
import assert from "node:assert/strict";
import { cleanTranscript, generate, generationConfigFor, interactionTranscript, interactionsTranscriptionBody, isRefusal, lockedStoryFacts, mentionsMinor, narrativeRequest, narrativeStays, replyChangesScene, sceneLock, speechToTextBody, storyContinuityLines, storyVoiceLines, transcribeAudio } from "./ai.mjs";

test("a video stays with the person who sent it", () => {
  const facts = lockedStoryFacts([
    { role: "model", text: "Te envié un video mío, de mí sola." },
    { role: "user", text: "Luego te digo qué voy a hacer con tu video." },
    { role: "model", text: "Hoy hace calor." },
  ], "Andrea", "William");
  assert.deepEqual(facts, [
    "Andrea: Te envié un video mío, de mí sola.",
    "William: Luego te digo qué voy a hacer con tu video.",
  ]);
  const rules = storyContinuityLines(true).join("\n");
  assert.match(rules, /sigue siendo suyo/);
  assert.match(rules, /No inventes una pareja/);
});

test("a reply cannot move the scene or invent a child", () => {
  const lock = sceneLock([
    { text: "Te cubro con el abrigo bajo la lluvia. Tienes miedo de la tormenta." },
  ], "No me sueltes.");
  assert.equal(lock.place, "tormenta");
  assert.equal(replyChangesScene("Te llevo a la cocina y te abrazo.", "bajo la lluvia, miedo de la tormenta"), true);
  assert.equal(replyChangesScene("Sigo cubriéndote bajo la lluvia.", "bajo la lluvia, miedo de la tormenta"), false);
  assert.equal(mentionsMinor("una niña de 7 años"), true);
  assert.equal(mentionsMinor("un hombre protege a su sobrina de la tormenta"), false);
  const source = "Un hombre protege a su sobrina de la lluvia porque teme las tormentas.";
  assert.equal(narrativeStays(source, "La sobrina sigue bajo la lluvia y la tormenta no cesa."), true);
  assert.equal(narrativeStays(source, "Una niña de 7 años mira el tejado con su tío."), false);
  const request = narrativeRequest({
    language: "es",
    story: { title: "La tormenta", description: source, character_role: "la sobrina", player_role: "el hombre" },
  });
  assert.match(request, /no es una historia nueva/);
  assert.match(request, /No inventes la edad/);
  assert.match(request, /lluvia/);
});

test("every chat keeps the same memory and does not restart the story", () => {
  const lines = storyContinuityLines(true).join("\n");
  assert.match(lines, /todo chat, nuevo o ya empezado/);
  assert.match(lines, /no disocies la conversación/);
  assert.match(lines, /mismo lugar/);
  assert.match(lines, /bajo la lluvia/);
  assert.match(lines, /memoria de lo que pasó/);
  assert.match(lines, /palabras nuevas/);
});

test("the character owns what the user says she did", () => {
  const lines = storyVoiceLines("Andrea", "William", true, "español").join("\n");
  assert.match(lines, /Andrea/);
  assert.match(lines, /asúmelo como tuyo/);
  assert.match(lines, /perspectiva/);
  assert.doesNotMatch(lines, /video que enviaste/);
  assert.match(lines, /PROHIBIDO REPETIR/);
});

test("an English scene keeps the same ownership rule", () => {
  const lines = storyVoiceLines("Andrea", "William", false, "inglés").join("\n");
  assert.match(lines, /keep that action yours/);
  assert.match(lines, /your own point of view/);
  assert.doesNotMatch(lines, /video you sent/);
});

test("story chat turns thinking off and retries when Gemini rejects that setting", async () => {
  assert.deepEqual(
    generationConfigFor("gemini-2.5-flash", { temperature: 0.7, maxOutputTokens: 2048 }, { fastReply: true }).thinkingConfig,
    { thinkingBudget: 0 },
  );
  assert.equal(generationConfigFor("gemini-2.5-flash", { temperature: 0.7 }, {}).thinkingConfig, undefined);
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  const bodies = [];
  const content = await generate("gemini-2.5-flash", [], { temperature: 0.7, maxOutputTokens: 2048 }, {
    fastReply: true,
    fallbackModels: [],
    contents: [{ role: "user", parts: [{ text: "ese video no era para mí" }] }],
    fetchImpl: async (_url, init) => {
      bodies.push(JSON.parse(init.body).generationConfig);
      if (bodies.length === 1) {
        return new Response(JSON.stringify({ error: { message: "Thinking budget is not supported for this model." } }), { status: 400 });
      }
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: "Ups, qué pena, sí me equivoqué." }] } }],
      }), { status: 200 });
    },
  });
  assert.equal(content, "Ups, qué pena, sí me equivoqué.");
  assert.deepEqual(bodies[0].thinkingConfig, { thinkingBudget: 0 });
  assert.equal(bodies[1].thinkingConfig, undefined);
  if (previous === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = previous;
});

test("Gemini 3.x uses thinking level and recovers from a generic invalid argument", async () => {
  assert.deepEqual(generationConfigFor("gemini-3.5-flash-lite", { responseMimeType: "application/json" }, { fastReply: true }).thinkingConfig, { thinkingLevel: "low" });
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  try {
    const bodies = [];
    const output = await generate("gemini-3.5-flash-lite", [{ text: "Tres capítulos" }], { responseMimeType: "application/json" }, {
      fastReply: true, fallbackModels: [],
      fetchImpl: async (_url, init) => {
        bodies.push(JSON.parse(init.body).generationConfig);
        return bodies.length === 1
          ? new Response(JSON.stringify({ error: { message: "Request contains an invalid argument." } }), { status: 400 })
          : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"title":"Prueba"}' }] } }] }), { status: 200 });
      },
    });
    assert.equal(JSON.parse(output).title, "Prueba");
    assert.deepEqual(bodies[0].thinkingConfig, { thinkingLevel: "low" });
    assert.equal(bodies[1].thinkingConfig, undefined);
  } finally {
    if (previous === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous;
  }
});

export function createSyntheticWav(durationMs = 500, sampleRate = 16000, frequency = 440) {
  const numSamples = Math.floor((durationMs / 1000) * sampleRate);
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.round(Math.sin(2 * Math.PI * frequency * t) * 16000);
    buffer.writeInt16LE(sample, 44 + i * 2);
  }
  return buffer;
}

test("interactionsTranscriptionBody constructs exact schema for gemini-3.5-transcribe", () => {
  const wavBase64 = createSyntheticWav(200).toString("base64");
  const body = interactionsTranscriptionBody(wavBase64, "audio/wav", "es-419");
  assert.equal(body.model, "gemini-3.5-transcribe");
  assert.equal(body.input[0].type, "audio");
  assert.equal(body.input[0].mime_type, "audio/wav");
  assert.equal(body.input[0].data, wavBase64);
  assert.deepEqual(body.generation_config.transcription_config.language_codes, ["es-419"]);
});

test("interactionTranscript parses diverse Interactions response shapes and cleans noise", () => {
  assert.equal(interactionTranscript({ output_text: "  \"Hola Andrea\"  " }), "Hola Andrea");
  assert.equal(interactionTranscript({ text: "Transcripción: ¿Dónde estás?" }), "¿Dónde estás?");
  assert.equal(interactionTranscript({
    steps: [
      { type: "user_input", content: [{ text: "audio" }] },
      { type: "model_output", content: [{ type: "text", text: "Vente conmigo ahora" }] },
    ],
  }), "Vente conmigo ahora");
  assert.equal(interactionTranscript({ output_text: "[silencio]" }), "");
  assert.equal(interactionTranscript({ output_text: "vacío" }), "");
  assert.equal(cleanTranscript("(silence)"), "");
});

test("transcribeAudio successfully calls Interactions endpoint with synthetic WAV", async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  try {
    const wav = createSyntheticWav(400).toString("base64");
    const calls = [];
    const result = await transcribeAudio(
      { audio: wav, language: "es", region: "co", mimeType: "audio/wav" },
      {
        fetchImpl: async (url, init) => {
          calls.push({ url: String(url), body: JSON.parse(init.body) });
          assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/interactions");
          return new Response(JSON.stringify({
            status: "completed",
            steps: [
              { type: "model_output", content: [{ type: "text", text: "Hola parce" }] },
            ],
          }), { status: 200 });
        },
      }
    );
    assert.equal(result.text, "Hola parce");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.model, "gemini-3.5-transcribe");
    assert.deepEqual(calls[0].body.generation_config.transcription_config.language_codes, ["es-419"]);
  } finally {
    if (previous === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous;
  }
});

test("transcribeAudio records attempt errors and activates fallback when primary fails", async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  try {
    const wav = createSyntheticWav(400).toString("base64");
    const calls = [];
    const result = await transcribeAudio(
      { audio: wav, language: "es", region: "mx", mimeType: "audio/wav" },
      {
        fetchImpl: async (url, init) => {
          calls.push({ url: String(url) });
          if (String(url).includes("/interactions")) {
            return new Response(JSON.stringify({
              error: { message: "Model gemini-3.5-transcribe temporarily unavailable" },
            }), { status: 503 });
          }
          return new Response(JSON.stringify({
            candidates: [{ content: { parts: [{ text: "Respuesta de respaldo" }] } }],
          }), { status: 200 });
        },
      }
    );
    assert.equal(result.text, "Respuesta de respaldo");
    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /\/interactions$/);
    assert.match(calls[1].url, /gemini-2\.5-flash:generateContent$/);
  } finally {
    if (previous === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous;
  }
});

test("transcribeAudio collects all attempt errors when all endpoints fail", async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  try {
    const wav = createSyntheticWav(400).toString("base64");
    await assert.rejects(
      async () => {
        await transcribeAudio(
          { audio: wav, language: "es", region: "mx", mimeType: "audio/wav" },
          {
            fetchImpl: async (url) => {
              if (String(url).includes("/interactions")) {
                return new Response(JSON.stringify({ error: { message: "Interactions 404" } }), { status: 404 });
              }
              return new Response(JSON.stringify({ error: { message: "Fallback 500" } }), { status: 500 });
            },
          }
        );
      },
      (err) => {
        assert.equal(err.code, "stt_failed");
        assert.equal(err.attempts.length, 2);
        assert.equal(err.attempts[0].strategy, "interactions:gemini-3.5-transcribe");
        assert.equal(err.attempts[0].status, 404);
        assert.equal(err.attempts[1].strategy, "generateContent:gemini-2.5-flash");
        assert.equal(err.attempts[1].status, 500);
        assert.match(err.details, /Interactions 404/);
        assert.match(err.details, /Fallback 500/);
        return true;
      }
    );
  } finally {
    if (previous === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous;
  }
});

test("silence under 2048 bytes returns empty text without calling upstream", async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  try {
    // 1000 bytes base64-encoded (which decodes to ~750 bytes < 2048)
    const smallAudio = Buffer.alloc(1000).toString("base64");
    let called = false;
    const result = await transcribeAudio(
      { audio: smallAudio, language: "es", mimeType: "audio/wav" },
      { fetchImpl: async () => { called = true; return new Response("{}"); } }
    );
    assert.equal(result.text, "");
    assert.equal(called, false);
  } finally {
    if (previous === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous;
  }
});

test("isRefusal detects Spanish and English safety refusals", () => {
  assert.equal(isRefusal("Lo siento, pero no puedo continuar con esta conversación. ¿Hay algo más en lo que pueda ayudarte?"), true);
  assert.equal(isRefusal("No puedo continuar con esta conversación."), true);
  assert.equal(isRefusal("¿Hay algo más en lo que pueda ayudarte?"), true);
  assert.equal(isRefusal("No puedo crear contenido explícito ni de adultos."), true);
  assert.equal(isRefusal("I cannot fulfill this request as an AI."), true);
  assert.equal(isRefusal("*Te miro sonriendo y te tomo de la mano* Claro que sí, dime qué quieres hacer."), false);
});
