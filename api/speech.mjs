import { createClient } from "@supabase/supabase-js";
import { supabaseUrl, publishableKey } from "./config.mjs";
import { isChirpConfigured, synthesizeChirp } from "./chirpTts.mjs";

const voices = { "scarlett-hd": "Aoede", "luna-sweet": "Leda", "aria-calm": "Kore", "max-deep": "Charon", "leo-warm": "Puck" };
const models = ["gemini-3.8-flash-lite-tts", "gemini-3.8-flash-tts", "gemini-3.1-flash-tts-preview"];
// Reused serverless instances skip a model briefly after a quota response.
const quotaCooldownUntil = new Map();


function sendEvent(res, event) {
  res.write("data: " + JSON.stringify(event) + "\n\n");
}

async function relaySse(upstream, res, legacy, onFirstAudio) {
  const reader = upstream.body.pipeThrough(new TextDecoderStream()).getReader();
  let pending = "";
  let audioStarted = false;
  const onLine = (line) => {
    if (!line.startsWith("data:")) return;
    const value = line.slice(5).trim();
    if (!value || value === "[DONE]") return;
    let message;
    try { message = JSON.parse(value); } catch { return; }
    const parts = legacy
      ? (message.candidates?.[0]?.content?.parts || []).map((part) => part.inlineData)
      : message.delta?.type === "audio" ? [message.delta] : [];
    for (const part of parts) {
      if (!part?.data || !(part.mimeType || part.mime_type || "").startsWith("audio/l16")) continue;
      if (!audioStarted) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();
        audioStarted = true;
        onFirstAudio();
      }
      sendEvent(res, { type: "speech.audio.delta", audio: part.data });
    }
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += value;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() || "";
      for (const line of lines) onLine(line);
    }
    if (pending.trim()) onLine(pending);
    if (audioStarted) {
      sendEvent(res, { type: "speech.audio.done" });
      res.end();
    }
    return audioStarted;
  } catch (error) {
    if (audioStarted) {
      sendEvent(res, { type: "speech.error", message: "La voz se interrumpió." });
      res.end();
      return true;
    }
    throw error;
  } finally {
    reader.releaseLock();
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

  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const geminiAvailable = Boolean(key && key !== "[SENSITIVE]");
  if (!geminiAvailable && !isChirpConfigured()) return res.status(503).json({ error: "neural_voice_not_configured" });
  const raw = typeof req.body?.text === "string" ? req.body.text : "";
  const text = raw.replace(/[*_#]/g, "").replace(/\s+/g, " ").trim().slice(0, 900);
  if (!text) return res.status(400).json({ error: "missing_text" });
  const voice = voices[req.body.voice] || "Kore";

  let lastStatus = 502;
  let quotaExceeded = false;
  const now = Date.now();
  const eligible = models.filter((model) => (quotaCooldownUntil.get(model) || 0) <= now);
  // A cooled-down Gemini model must not block the independent Cloud TTS provider.
  if (eligible.length === 0) quotaExceeded = true;
  for (const model of geminiAvailable ? eligible : []) {
    const modelStartedAt = Date.now();
    try {
      const legacy = model === "gemini-3.1-flash-tts-preview";
      const speechText = legacy
        ? "Lee en voz alta el texto completo, palabra por palabra, con voz cálida y natural. Pronuncia tanto la narración como el diálogo; no omitas ninguna parte. TEXTO COMPLETO:\n" + text
        : text;
      const upstream = await fetch(
        legacy
          ? "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":streamGenerateContent?alt=sse"
          : "https://generativelanguage.googleapis.com/v1beta/interactions",
        {
          method: "POST",
          headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
          body: JSON.stringify(legacy
            ? {
                contents: [{ role: "user", parts: [{ text: speechText }] }],
                generationConfig: {
                  responseModalities: ["AUDIO"],
                  speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
                },
              }
            : {
                model,
                input: [{ type: "user_input", content: [{
                  type: "text", text, annotations: [{ type: "speech_metadata", style: "Voz natural, cálida y clara; ritmo conversacional" }],
                }] }],
                response_format: { type: "audio", mime_type: "audio/l16", sample_rate: 24000 },
                generation_config: { speech_config: [{ voice }] },
                stream: true,
              }),
          signal: AbortSignal.timeout(35000),
        },
      );
      if (!upstream.ok) {
        lastStatus = upstream.status;
        quotaExceeded ||= upstream.status === 429;
        if (upstream.status === 429) {
          const retrySeconds = Number(upstream.headers.get("retry-after"));
          quotaCooldownUntil.set(model, Date.now() + (Number.isFinite(retrySeconds) && retrySeconds > 0
            ? Math.min(retrySeconds * 1000, 120_000) : 45_000));
        }
        console.warn("Insomnia speech provider", model, upstream.status, "after_ms", Date.now() - modelStartedAt);
        if ([429, 500, 502, 503, 504].includes(upstream.status)) continue;
        break;
      }
      if (await relaySse(upstream, res, legacy, () =>
        console.info("Insomnia speech first_audio", model, "total_ms", Date.now() - startedAt)
      )) {
        console.info("Insomnia speech complete", model, "total_ms", Date.now() - startedAt);
        return;
      }
      console.warn("Insomnia speech provider returned no audio", model);
      lastStatus = 502;
    } catch (failure) {
      if (res.headersSent) return;
      lastStatus = 504;
      console.warn("Insomnia speech provider timeout", model, failure.name);
    }
  }
  if (isChirpConfigured()) {
    const chirpStarted = Date.now();
    try {
      const result = await synthesizeChirp(text, req.body.voice, req.body.language);
      if (result.status === 200) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();
        sendEvent(res, { type: "speech.provider", provider: "chirp3-hd" });
        console.info("Insomnia speech first_audio chirp3-hd total_ms", Date.now() - startedAt);
        for (let offset = 0; offset < result.pcm.length; offset += 32_768) {
          sendEvent(res, { type: "speech.audio.delta", audio: result.pcm.subarray(offset, offset + 32_768).toString("base64") });
        }
        sendEvent(res, { type: "speech.audio.done" });
        res.end();
        console.info("Insomnia speech complete chirp3-hd total_ms", Date.now() - startedAt);
        return;
      }
      lastStatus = result.status;
      quotaExceeded ||= result.status === 429;
      console.warn("Insomnia speech provider chirp3-hd", result.status, "after_ms", Date.now() - chirpStarted);
    } catch (failure) {
      lastStatus = 502;
      console.warn("Insomnia speech provider chirp3-hd failed", failure?.name || "Error", "after_ms", Date.now() - chirpStarted);
    }
  }
  return res.status(quotaExceeded ? 429 : lastStatus).json({
    error: quotaExceeded ? "tts_quota_exhausted" : "tts_unavailable",
    message: quotaExceeded
      ? (isChirpConfigured()
        ? "Los proveedores de voz neural no tienen cuota disponible en este momento."
        : "Gemini agotó su cuota y Chirp 3 HD aún no tiene credenciales de Google Cloud.")
      : "La voz neural no está disponible en este momento.",
  });
}
