import test from "node:test";
import assert from "node:assert/strict";
import { cleanTranscript, generate, generationConfigFor, lockedStoryFacts, speechToTextRequest, storyContinuityLines, storyVoiceLines, transcribeAudio } from "./ai.mjs";

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

test("every chat keeps the same memory and does not restart the story", () => {
  const lines = storyContinuityLines(true).join("\n");
  assert.match(lines, /todo chat, nuevo o ya empezado/);
  assert.match(lines, /no disocies la conversación/);
  assert.match(lines, /memoria de lo que pasó/);
  assert.match(lines, /palabras nuevas/);
});

test("the character owns what the user says she did", () => {
  const lines = storyVoiceLines("Andrea", "William", true, "español").join("\n");
  assert.match(lines, /conversación real/);
  assert.match(lines, /esa acción es tuya/);
  assert.match(lines, /te equivocaste al enviarlo/);
  assert.match(lines, /No digas que tú también lo viste/);
  assert.match(lines, /disculpa nueva/);
  assert.doesNotMatch(lines, /220 caracteres/);
});

test("an English scene keeps the same ownership rule", () => {
  const lines = storyVoiceLines("Andrea", "William", false, "inglés").join("\n");
  assert.match(lines, /that action is yours/);
  assert.match(lines, /sent it to the wrong person/);
  assert.match(lines, /Do not say you also watched it/);
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

test("a call transcript goes to Gemini 2.5 with the wav and no special transcribe model", async () => {
  const audio = "A".repeat(3000);
  const request = speechToTextRequest({ audio, language: "es", region: "mx", mimeType: "audio/wav" });
  assert.equal(request.model, "gemini-2.5-flash");
  assert.match(request.parts[0].text, /Transcribe exactamente/);
  assert.match(request.parts[0].text, /es-MX/);
  assert.deepEqual(request.parts[1].inlineData, { mimeType: "audio/wav", data: audio });
  assert.equal(request.settings.audioTranscriptionConfig, undefined);
  assert.equal(request.options.allowEmpty, true);
  let seen;
  const heard = await transcribeAudio({ audio, language: "es", region: "plain" }, async (model, parts, settings, options) => {
    seen = { model, parts, settings, options };
    return "\"hola, te estoy oyendo\"";
  });
  assert.equal(heard.text, "hola, te estoy oyendo");
  assert.equal(seen.model, "gemini-2.5-flash");
  assert.equal(seen.options.timeoutMs, 45000);
  assert.equal(cleanTranscript("vacío"), "");
  assert.equal(cleanTranscript("[silence]"), "");
});

test("silence in a call is an empty transcript, not an error", async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  const content = await generate("gemini-2.5-flash", [{ text: "audio" }], { temperature: 0 }, {
    allowEmpty: true,
    fallbackModels: [],
    fetchImpl: async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "" }] } }],
    }), { status: 200 }),
  });
  assert.equal(content, "");
  if (previous === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = previous;
});
