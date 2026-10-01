import test from "node:test";
import assert from "node:assert/strict";
import { cloudVoiceFor, cloudGeminiVoiceFor, decodeWavPcm, removePerformanceCues, synthesizeChirp, synthesizeCloudGemini } from "./chirpTts.mjs";

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

test("the Spanish Scarlett backup selects a female Chirp voice", () => {
  assert.deepEqual(cloudVoiceFor("scarlett-hd", "es"), {
    languageCode: "es-US", name: "es-US-Chirp3-HD-Aoede",
  });
  assert.equal(cloudVoiceFor("luna-sweet", "es").name, "es-US-Chirp3-HD-Leda");
  assert.equal(cloudVoiceFor("aria-calm", "es").name, "es-US-Chirp3-HD-Kore");
});

test("cloud synthesis uses OAuth, returns headerless 24 kHz mono PCM", async () => {
  const { pcm, wav } = sampleWav();
  let called = 0;
  const result = await synthesizeChirp("Hola.", "scarlett-hd", "es", {
    tokenProvider: async () => "test-oauth-token",
    fetchImpl: async (url, init) => {
      called += 1;
      assert.equal(url, "https://texttospeech.googleapis.com/v1/text:synthesize");
      assert.equal(init.headers.Authorization, "Bearer test-oauth-token");
      const body = JSON.parse(init.body);
      assert.equal(body.voice.name, "es-US-Chirp3-HD-Aoede");
      assert.equal(body.audioConfig.audioEncoding, "LINEAR16");
      assert.equal(body.audioConfig.sampleRateHertz, 24000);
      return new Response(JSON.stringify({ audioContent: wav.toString("base64") }), { status: 200 });
    },
  });
  assert.equal(called, 1);
  assert.equal(result.status, 200);
  assert.deepEqual(result.pcm, pcm);
  assert.throws(() => decodeWavPcm(Buffer.from("not audio").toString("base64")), /invalid_wav/);
});

test("Cloud Gemini uses the character's expressive voice and PCM response", async () => {
  const { pcm, wav } = sampleWav();
  const result = await synthesizeCloudGemini("Ay, me duele.", "scarlett-hd", "es", {
    performance: "pain",
    tokenProvider: async () => "test-oauth-token",
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      assert.equal(body.voice.model_name, "gemini-2.5-flash-tts");
      assert.equal(body.voice.name, "Aoede");
      assert.equal(body.input.text, "Ay, me duele.");
      assert.match(body.input.prompt, /sonidos, no palabras/);
      assert.match(body.input.prompt, /Reacciona al dolor/);
      return new Response(JSON.stringify({ audioContent: wav.toString("base64") }), { status: 200 });
    },
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.pcm, pcm);
  assert.equal(cloudGeminiVoiceFor("luna-sweet", "es").name, "Leda");
  assert.equal(removePerformanceCues("[sigh] Me duele."), "Me duele.");
});
