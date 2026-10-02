import test from "node:test";
import assert from "node:assert/strict";
import { cleanTranscript, generate, generationConfigFor, lockedStoryFacts, speechToTextBody, storyContinuityLines, storyVoiceLines, transcribeAudio } from "./ai.mjs";

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

test("a call sends the microphone file to the transcriber and never asks a chat model to greet", async () => {
  const body = speechToTextBody("files/mic", "audio/wav", "es-MX");
  assert.deepEqual(body.contents[0].parts, [{ fileData: { fileUri: "files/mic", mimeType: "audio/wav" } }]);
  assert.equal(JSON.stringify(body).includes("Transcribe"), false);
  assert.equal(body.generationConfig.audioTranscriptionConfig.languageCodes[0], "es-MX");
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  const calls = [];
  const wav = Buffer.alloc(3000, 1).toString("base64");
  const heard = await transcribeAudio({ audio: wav, language: "es", region: "mx", mimeType: "audio/wav" }, {
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), body: init.body, headers: init.headers });
      if (String(url).includes("/upload/")) {
        return new Response(JSON.stringify({ file: { uri: "https://generativelanguage.googleapis.com/v1beta/files/mic" } }), { status: 200 });
      }
      const request = JSON.parse(init.body);
      assert.equal(request.contents[0].parts[0].text, undefined);
      assert.equal(request.contents[0].parts[0].fileData.mimeType, "audio/wav");
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: "quiero verte esta noche" }] } }],
      }), { status: 200 });
    },
  });
  assert.equal(heard.text, "quiero verte esta noche");
  assert.match(calls[0].url, /\/upload\/v1beta\/files$/);
  assert.match(calls[1].url, /gemini-3\.5-transcribe:generateContent$/);
  assert.equal(calls[1].body.includes("gemini-2.5-flash"), false);
  assert.equal(cleanTranscript("vacío"), "");
  if (previous === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = previous;
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
