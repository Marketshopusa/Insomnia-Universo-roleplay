import { createClient } from "@supabase/supabase-js";
import { supabaseUrl, publishableKey } from "./config.mjs";

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
      sendEvent(res, { type: "speech.error", message: "La voz se interrumpiÃ³." });
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

  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key || key === "[SENSITIVE]") return res.status(503).json({ error: "gemini_not_configured", message: "Gemini no estÃ¡ configurado en Insomnia." });
  const raw = typeof req.body?.text === "string" ? req.body.text : "";
  const text = raw.replace(/[*_#]/g, "").replace(/\s+/g, " ").trim().slice(0, 900);
  if (!text) return res.status(400).json({ error: "missing_text" });
  const voice = voices[req.body.voice] || "Kore";

  let lastStatus = 502;
  let quotaExceeded = false;
  const eligible = models.filter((model) => (quotaCooldownUntil.get(model) || 0) <= Date.now());
  for (const model of eligible.length ? eligible : models) {
    const modelStartedAt = Date.now();
    try {
      const legacy = model === "gemini-3.1-flash-tts-preview";
      const speechText = legacy
        ? "Lee en voz alta el texto completo, palabra por palabra, con voz cÃ¡lida y natural. Pronuncia tanto la narraciÃ³n como el diÃ¡logo; no omitas ninguna parte. TEXTO COMPLETO:\n" + text
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
                  type: "text", text, annotations: [{ type: "speech_metadata", style: "Voz natural, cÃ¡lida y clara; ritmo conversacional" }],
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
  return res.status(quotaExceeded ? 429 : lastStatus).json({
    error: quotaExceeded ? "tts_quota_exhausted" : "tts_unavailable",
    message: quotaExceeded
      ? "Se alcanzÃ³ el lÃ­mite de voces Gemini de este proyecto. Prueba mÃ¡s tarde o habilita mÃ¡s cuota en Google AI."
      : "La voz Gemini no estÃ¡ disponible en este momento.",
  });
}
