import { createClient } from "@supabase/supabase-js";
import { supabaseUrl, publishableKey } from "./config.mjs";
import { explainGeminiFailure, getGeminiAccessToken, isGeminiConfigured, speechPieces, synthesizeGemini, removePerformanceCues } from "./geminiTts.mjs";


function sendEvent(res, event) {
  res.write("data: " + JSON.stringify(event) + "\n\n");
}

function beginPcm(res, provider, startedAt) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  sendEvent(res, { type: "speech.provider", provider });
  console.info("Insomnia speech first_audio", provider, "total_ms", Date.now() - startedAt);
}

function writePcm(res, pcm) {
  for (let offset = 0; offset < pcm.length; offset += 32_768) {
    sendEvent(res, { type: "speech.audio.delta", audio: pcm.subarray(offset, offset + 32_768).toString("base64") });
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  const startedAt = Date.now();
  const jwt = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const { data, error } = jwt
    ? await createClient(supabaseUrl, publishableKey, { auth: { persistSession: false } }).auth.getUser(jwt)
    : { data: null, error: true };
  if (error || !data?.user) return res.status(401).json({ error: "login_required" });
  if (req.body?.metric === "first_playback") {
    const elapsed = Number(req.body.elapsedMs);
    if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > 120_000) {
      return res.status(400).json({ error: "invalid_voice_metric" });
    }
    console.info("Insomnia speech browser_first_audio_ms", Math.round(elapsed));
    return res.status(204).end();
  }

  if (!isGeminiConfigured()) {
    return res.status(503).json({
      error: "neural_voice_not_configured",
      message: "Gemini 2.5 Flash TTS no está configurado en este sitio.",
    });
  }
  const raw = typeof req.body?.text === "string" ? req.body.text : "";
  const text = raw.replace(/[*_#]/g, "").replace(/\s+/g, " ").trim().slice(0, 1400);
  const plainText = removePerformanceCues(text);
  if (!plainText) return res.status(400).json({ error: "missing_text" });
  const region = typeof req.body.region === "string" ? req.body.region : "mx";
  const performance = ["neutral", "amused", "sad", "pain", "pleasure", "scream", "soft"].includes(req.body.performance)
    ? req.body.performance : "neutral";
  try {
    const pieces = speechPieces(text);
    const token = await getGeminiAccessToken();
    const options = { performance, region, tokenProvider: async () => token };
    const jobs = pieces.map((piece) => synthesizeGemini(piece, req.body.voice, req.body.language, options));
    const first = await jobs[0];
    if (first.status !== 200) {
      console.warn("Insomnia speech gemini-2.5-flash-tts", first.status, first.detail || "", "after_ms", Date.now() - startedAt);
      const status = first.status === 429 ? 429 : first.status === 403 ? 403 : 502;
      return res.status(status).json({
        error: first.status === 429 ? "tts_quota_exhausted" : "tts_unavailable",
        message: explainGeminiFailure(first.status, first.detail),
      });
    }
    beginPcm(res, "gemini-2.5-flash-tts", startedAt);
    writePcm(res, first.pcm);
    for (let index = 1; index < jobs.length; index += 1) {
      const next = await jobs[index];
      if (next.status !== 200) {
        console.warn("Insomnia speech gemini continuation", next.status, next.detail || "");
        break;
      }
      writePcm(res, next.pcm);
    }
    sendEvent(res, { type: "speech.audio.done" });
    res.end();
    console.info("Insomnia speech complete", "gemini-2.5-flash-tts", "total_ms", Date.now() - startedAt);
    return;
  } catch (failure) {
    console.warn("Insomnia speech gemini failed", failure?.message || failure?.name || "Error", "after_ms", Date.now() - startedAt);
    return res.status(502).json({
      error: "tts_unavailable",
      message: "Gemini 2.5 Flash TTS no pudo hablar esta línea.",
    });
  }
}
