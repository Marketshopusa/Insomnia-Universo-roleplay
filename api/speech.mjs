import { createClient } from "@supabase/supabase-js";
import { supabaseUrl, publishableKey } from "./config.mjs";
import { isChirpConfigured, synthesizeChirp, removePerformanceCues } from "./chirpTts.mjs";


function sendEvent(res, event) {
  res.write("data: " + JSON.stringify(event) + "\n\n");
}

function writePcm(res, pcm, provider, startedAt) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  sendEvent(res, { type: "speech.provider", provider });
  console.info("Insomnia speech first_audio", provider, "total_ms", Date.now() - startedAt);
  for (let offset = 0; offset < pcm.length; offset += 32_768) {
    sendEvent(res, { type: "speech.audio.delta", audio: pcm.subarray(offset, offset + 32_768).toString("base64") });
  }
  sendEvent(res, { type: "speech.audio.done" });
  res.end();
  console.info("Insomnia speech complete", provider, "total_ms", Date.now() - startedAt);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  const startedAt = Date.now();
  const jwt = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const { data, error } = jwt
    ? await createClient(supabaseUrl, publishableKey, { auth: { persistSession: false } }).auth.getUser(jwt)
    : { data: null, error: true };
  if (error || !data?.user) return res.status(401).json({ error: "login_required" });
  if (req.body?.metric === "device_voice") {
    const state = req.body.state;
    const reasons = new Set(["unavailable", "start_timeout", "playback_failed", "unknown"]);
    if (!["attempt", "started", "failed"].includes(state)) return res.status(400).json({ error: "invalid_voice_metric" });
    const reason = reasons.has(req.body.reason) ? req.body.reason : "unknown";
    console.info("Insomnia device_voice", state, state === "failed" ? reason : "");
    return res.status(204).end();
  }
  if (req.body?.metric === "first_playback") {
    const elapsed = Number(req.body.elapsedMs);
    if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > 120_000) {
      return res.status(400).json({ error: "invalid_voice_metric" });
    }
    console.info("Insomnia speech browser_first_audio_ms", Math.round(elapsed));
    return res.status(204).end();
  }

  if (!isChirpConfigured()) {
    return res.status(503).json({
      error: "neural_voice_not_configured",
      message: "Google Cloud Chirp no está configurado en este sitio.",
    });
  }
  const raw = typeof req.body?.text === "string" ? req.body.text : "";
  const text = raw.replace(/[*_#]/g, "").replace(/\s+/g, " ").trim().slice(0, 1400);
  const plainText = removePerformanceCues(text);
  if (!plainText) return res.status(400).json({ error: "missing_text" });
  const region = typeof req.body.region === "string" ? req.body.region : "mx";
  try {
    const result = await synthesizeChirp(plainText, req.body.voice, req.body.language, { region });
    if (result.status === 200) {
      writePcm(res, result.pcm, "chirp3-hd", startedAt);
      return;
    }
    console.warn("Insomnia speech chirp3-hd", result.status, "after_ms", Date.now() - startedAt);
    return res.status(result.status === 429 ? 429 : 502).json({
      error: result.status === 429 ? "tts_quota_exhausted" : "tts_unavailable",
      message: result.status === 429
        ? "Google Cloud no tiene cuota de voz en este momento. El texto sigue disponible."
        : "La voz de Google Cloud no pudo hablar esta línea.",
    });
  } catch (failure) {
    console.warn("Insomnia speech chirp failed", failure?.name || "Error", "after_ms", Date.now() - startedAt);
    return res.status(502).json({
      error: "tts_unavailable",
      message: "La voz de Google Cloud no pudo hablar esta línea.",
    });
  }
}
