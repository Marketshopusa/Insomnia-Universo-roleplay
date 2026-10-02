import test from "node:test";
import assert from "node:assert/strict";
import { cloudGeminiVoiceFor, decodeLinear16, explainGeminiFailure, geminiSpeechDirection, removePerformanceCues, synthesizeGemini } from "./geminiTts.mjs";

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
      assert.equal(body.voice.languageCode, "es-ES");
      assert.equal(body.voice.name, "Aoede");
      assert.equal(body.advancedVoiceOptions.safetySettings.settings[0].threshold, "BLOCK_NONE");
      assert.match(body.input.prompt, /México/);
      return new Response(JSON.stringify({ audioContent: wav.toString("base64") }), { status: 200 });
    },
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.pcm, pcm);
  if (previousAccount === undefined) delete process.env.GOOGLE_CLOUD_TTS_SERVICE_ACCOUNT_JSON;
  else process.env.GOOGLE_CLOUD_TTS_SERVICE_ACCOUNT_JSON = previousAccount;
});

test("a plain region keeps Gemini's own Spanish voice", () => {
  const prompt = geminiSpeechDirection("es", "neutral", "plain");
  assert.match(prompt, /voz natural/);
  assert.doesNotMatch(prompt, /venezolano|mexicano|colombiano|rioplatense|chileno|castellano/);
});

test("Spanish uses one es-ES request and keeps the regional accent in the prompt", async () => {
  const { wav } = sampleWav();
  const locales = [];
  const result = await synthesizeGemini("Chamo, no puede ser.", "Aoede", "es", {
    region: "ve",
    tokenProvider: async () => "test-oauth-token",
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      locales.push(body.voice.languageCode);
      assert.match(body.input.prompt, /venezolano/);
      assert.match(body.input.prompt, /exactamente/);
      assert.match(body.input.prompt, /\[laughing\]/);
      assert.equal(body.input.text, "Chamo, no puede ser.");
      return new Response(JSON.stringify({ audioContent: wav.toString("base64") }), { status: 200 });
    },
  });
  assert.deepEqual(locales, ["es-ES"]);
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
