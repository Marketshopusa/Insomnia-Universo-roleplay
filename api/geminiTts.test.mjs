import test from "node:test";
import assert from "node:assert/strict";
import { cloudGeminiVoiceFor, decodeLinear16, explainGeminiFailure, geminiSpeechDirection, geminiStreamBody, pcmFromSseLine, removePerformanceCues, streamGeminiSpeech, synthesizeGemini } from "./geminiTts.mjs";

function sampleWav() {
  const pcm = Buffer.alloc(48_000, 1);
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(24000, 24);
  wav.writeUInt32LE(48000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(pcm.length, 40);
  pcm.copy(wav, 44);
  return { pcm, wav };
}

test("Gemini 2.5 Flash TTS speaks Aoede with the story accent", async () => {
  const { pcm, wav } = sampleWav();
  const previousAccount = process.env.GOOGLE_CLOUD_TTS_SERVICE_ACCOUNT_JSON;
  process.env.GOOGLE_CLOUD_TTS_SERVICE_ACCOUNT_JSON = JSON.stringify({ project_id: "project-92a5eaa1-857a-4011-a86" });
  const result = await synthesizeGemini("Ay, me duele.", "scarlett-hd", "es", {
    performance: "pain",
    tokenProvider: async () => "test-oauth-token",
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers["x-goog-user-project"], "project-92a5eaa1-857a-4011-a86");
      const body = JSON.parse(init.body);
      assert.equal(body.voice.modelName, "gemini-2.5-flash-tts");
      assert.equal(body.voice.languageCode, "es-MX");
      assert.equal(body.voice.name, "Aoede");
      assert.equal(body.advancedVoiceOptions.safetySettings.settings[0].threshold, "BLOCK_NONE");
      assert.match(body.input.prompt, /mexicano del centro de México/);
      return new Response(JSON.stringify({ audioContent: wav.toString("base64") }), { status: 200 });
    },
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.pcm, pcm);
  if (previousAccount === undefined) delete process.env.GOOGLE_CLOUD_TTS_SERVICE_ACCOUNT_JSON;
  else process.env.GOOGLE_CLOUD_TTS_SERVICE_ACCOUNT_JSON = previousAccount;
});

test("a smile and a surprise color the delivery without inserting laughter", () => {
  assert.match(geminiSpeechDirection("es", "warm", "plain"), /sonrisa.*sin reír/);
  assert.match(geminiSpeechDirection("es", "surprised", "plain"), /sorpresa natural/);
});

test("a plain region keeps Gemini's own Spanish voice", () => {
  const prompt = geminiSpeechDirection("es", "neutral", "plain");
  assert.match(prompt, /voz natural/);
  assert.doesNotMatch(prompt, /venezolano|mexicano|colombiano|rioplatense|chileno|castellano/);
});

test("all six regional selections reach Gemini with distinct directions and supported locales", () => {
  const cases = [
    ["ar", "rioplatense urbano de Buenos Aires", "es-419"],
    ["ve", "venezolano urbano de Caracas", "es-419"],
    ["co", "colombiano de Bogotá", "es-419"],
    ["mx", "mexicano del centro de México", "es-MX"],
    ["es", "castellano peninsular de España", "es-ES"],
    ["cl", "chileno urbano de Santiago", "es-419"],
  ];
  const prompts = cases.map(([region, hint, locale]) => {
    const body = geminiStreamBody("Buenos días.", "Aoede", "es", "neutral", region);
    assert.equal(body.generation_config.speech_config.language_code, locale);
    assert.match(body.contents.parts.text, new RegExp(hint));
    return body.contents.parts.text;
  });
  assert.equal(new Set(prompts).size, cases.length);
});

test("Venezuela selection sends the country-specific accent while keeping supported es-419", async () => {
  const { wav } = sampleWav();
  const locales = [];
  const result = await synthesizeGemini("Chamo, no puede ser.", "Aoede", "es", {
    region: "ve",
    tokenProvider: async () => "test-oauth-token",
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      locales.push(body.voice.languageCode);
      assert.match(body.input.prompt, /venezolano urbano de Caracas/);
      assert.match(body.input.prompt, /No añadas modismos, no exageres/);
      assert.doesNotMatch(body.input.prompt, /gritos|aplausos|gemidos|\[laughing\]/i);
      assert.equal(body.input.text, "Chamo, no puede ser.");
      return new Response(JSON.stringify({ audioContent: wav.toString("base64") }), { status: 200 });
    },
  });
  assert.deepEqual(locales, ["es-419"]);
  assert.equal(result.status, 200);
  assert.equal(cloudGeminiVoiceFor("luna-sweet", "es", "ve").name, "Leda");
  assert.equal(cloudGeminiVoiceFor("Aoede", "es", "es").languageCode, "es-ES");
  assert.equal(removePerformanceCues("[sigh] Me duele."), "Me duele.");
  const raw = Buffer.alloc(4);
  raw.writeInt16LE(1000, 0);
  raw.writeInt16LE(-1000, 2);
  assert.deepEqual(decodeLinear16(raw.toString("base64")), raw);
});

test("a disabled Agent Platform API is enabled once and then spoken", async () => {
  const { wav } = sampleWav();
  const urls = [];
  const previousAccount = process.env.GOOGLE_CLOUD_TTS_SERVICE_ACCOUNT_JSON;
  process.env.GOOGLE_CLOUD_TTS_SERVICE_ACCOUNT_JSON = JSON.stringify({ project_id: "project-92a5eaa1-857a-4011-a86" });
  let spoken = false;
  const result = await synthesizeGemini("Hola.", "Aoede", "es", {
    region: "es",
    sleep: async () => {},
    tokenProvider: async () => "test-oauth-token",
    fetchImpl: async (url) => {
      urls.push(url);
      if (String(url).includes("aiplatform.googleapis.com:enable")) return new Response("{}", { status: 200 });
      if (!spoken) {
        spoken = true;
        return new Response(JSON.stringify({
          error: { code: 403, message: "Agent Platform API has not been used in project 28149907863 before or it is disabled." },
        }), { status: 403 });
      }
      return new Response(JSON.stringify({ audioContent: wav.toString("base64") }), { status: 200 });
    },
  });
  assert.equal(result.status, 200);
  assert.ok(urls.some((url) => String(url).includes("projects/project-92a5eaa1-857a-4011-a86/services/aiplatform.googleapis.com:enable")));
  assert.match(explainGeminiFailure(403, "Agent Platform API has not been used in project 28149907863 before or it is disabled."), /28149907863/);
  if (previousAccount === undefined) delete process.env.GOOGLE_CLOUD_TTS_SERVICE_ACCOUNT_JSON;
  else process.env.GOOGLE_CLOUD_TTS_SERVICE_ACCOUNT_JSON = previousAccount;
});

function sseAudio(chunks) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        const payload = JSON.stringify({
          candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/pcm", data: chunk.toString("base64") } }] } }],
        });
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      }
      controller.close();
    },
  }), { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

test("streaming speaks the whole line once and emits each audio chunk", async () => {
  const line = "Ella abrió la puerta. [shouting] ¡Ay!";
  const first = Buffer.alloc(4);
  first.writeInt16LE(1000, 0);
  first.writeInt16LE(2000, 2);
  const second = Buffer.alloc(2);
  second.writeInt16LE(-3000, 0);
  const previousAccount = process.env.GOOGLE_CLOUD_TTS_SERVICE_ACCOUNT_JSON;
  process.env.GOOGLE_CLOUD_TTS_SERVICE_ACCOUNT_JSON = JSON.stringify({ project_id: "project-92a5eaa1-857a-4011-a86" });
  const heard = [];
  let calls = 0;
  const result = await streamGeminiSpeech(line, "Aoede", "es", {
    performance: "pleasure",
    region: "plain",
    tokenProvider: async () => "test-oauth-token",
    onAudio: (pcm) => heard.push(Buffer.from(pcm)),
    fetchImpl: async (url, init) => {
      calls += 1;
      assert.match(String(url), /models\/gemini-2\.5-flash-tts:streamGenerateContent\?alt=sse/);
      assert.equal(init.headers["x-goog-user-project"], "project-92a5eaa1-857a-4011-a86");
      const body = JSON.parse(init.body);
      const spoken = body.contents.parts.text;
      assert.equal(spoken.split(line).length - 1, 1);
      assert.match(spoken, /\[shouting\]/);
      assert.doesNotMatch(spoken, /gritos, aplausos, gemidos/i);
      assert.equal(body.generation_config.speech_config.language_code, "es-419");
      assert.equal(body.generation_config.speech_config.voice_config.prebuilt_voice_config.voice_name, "Aoede");
      assert.equal(body.safety_settings[0].threshold, "BLOCK_NONE");
      assert.match(geminiStreamBody(line, "Aoede", "es", "pleasure", "plain").contents.parts.text, /voz natural/);
      return sseAudio([first, second]);
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  assert.deepEqual(heard, [first, second]);
  assert.equal(pcmFromSseLine("data: [DONE]"), null);
  if (previousAccount === undefined) delete process.env.GOOGLE_CLOUD_TTS_SERVICE_ACCOUNT_JSON;
  else process.env.GOOGLE_CLOUD_TTS_SERVICE_ACCOUNT_JSON = previousAccount;
});

test("a failed audio stream returns before any sound so unary speech can take over", async () => {
  const previousAccount = process.env.GOOGLE_CLOUD_TTS_SERVICE_ACCOUNT_JSON;
  process.env.GOOGLE_CLOUD_TTS_SERVICE_ACCOUNT_JSON = JSON.stringify({ project_id: "project-92a5eaa1-857a-4011-a86" });
  let heard = false;
  const result = await streamGeminiSpeech("Hola.", "Aoede", "es", {
    tokenProvider: async () => "test-oauth-token",
    onAudio: () => { heard = true; },
    fetchImpl: async () => new Response("stream unavailable", { status: 404 }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
  assert.equal(heard, false);
  if (previousAccount === undefined) delete process.env.GOOGLE_CLOUD_TTS_SERVICE_ACCOUNT_JSON;
  else process.env.GOOGLE_CLOUD_TTS_SERVICE_ACCOUNT_JSON = previousAccount;
});