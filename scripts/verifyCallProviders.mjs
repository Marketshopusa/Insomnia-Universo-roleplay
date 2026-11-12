import assert from "node:assert/strict";
import { generateNvidia, transcribeAudio } from "../api/ai.mjs";
import { synthesizeGemini } from "../api/_geminiTts.mjs";

try {
  let started = Date.now();
  const reply = await generateNvidia([
    { role: "system", content: "Responde en español en una sola oración breve." },
    { role: "user", content: "Saluda con las palabras: Hola, esta es una prueba de llamada." },
  ], { maxTokens: 55, timeoutMs: 8000 });
  assert.ok(reply && reply.length > 5, "text provider did not reply");
  console.log("CALL_PROVIDER_CHECK", JSON.stringify({ stage: "text", ok: true, ms: Date.now() - started }));
  started = Date.now();
  const voice = await synthesizeGemini("Hola. Esta es una prueba de llamada.", "Aoede", "es", { region: "plain" });
  assert.equal(voice.status, 200, "voice provider failed");
  assert.ok(voice.pcm?.length > 2048, "voice provider returned no audio");
  console.log("CALL_PROVIDER_CHECK", JSON.stringify({ stage: "voice", ok: true, ms: Date.now() - started, audioBytes: voice.pcm.length }));
  const wav = Buffer.alloc(44);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + voice.pcm.length, 4); wav.write("WAVE", 8);
  wav.write("fmt ", 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(voice.pcm.length, 40);
  started = Date.now();
  const heard = await transcribeAudio({ audio: Buffer.concat([wav, voice.pcm]).toString("base64"), mimeType: "audio/wav", language: "es", region: "plain" });
  assert.match(heard.text, /prueba|llamada/i, "transcription did not recover the spoken sentence");
  console.log("CALL_PROVIDER_CHECK", JSON.stringify({ stage: "transcription", ok: true, ms: Date.now() - started, text: heard.text }));
} catch (error) {
  console.error("CALL_PROVIDER_CHECK_FAILED", JSON.stringify({ code: error.code || error.name, message: String(error.message || error).replace(/Bearer\s+\S+|nvapi-[A-Za-z0-9_-]+|AIza[A-Za-z0-9_-]+/g, "[REDACTED]").slice(0, 300) }));
  process.exitCode = 1;
}
