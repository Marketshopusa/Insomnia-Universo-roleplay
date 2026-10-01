import { createClient } from "@supabase/supabase-js";
import { supabaseUrl, publishableKey } from "./config.mjs";
import { isChirpConfigured, synthesizeChirp, synthesizeCloudGemini, removePerformanceCues, previewVoice } from "./chirpTts.mjs";
import { accentHint } from "./regions.mjs";
const models = ["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"];
// Reused serverless instances skip a model briefly after a quota response.
const quotaCooldownUntil = new Map();
let cloudGeminiCooldownUntil = 0;
// Cloud Gemini is opt-in and automatically stops before the trial end date.
function cloudGeminiTrialEnabled() {
  const endsAt = Date.parse(process.env.GCP_GEMINI_TTS_TRIAL_END || "");
  return process.env.GCP_GEMINI_TTS_TRIAL_ENABLED === "true"
    && Number.isFinite(endsAt) && Date.now() < endsAt;
}


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
  const plainText = removePerformanceCues(text);
  if (!plainText) return res.status(400).json({ error: "missing_text" });
  const voice = previewVoice(req.body.voice);
  const region = typeof req.body.region === "string" ? req.body.region : "mx";
  const performance = ["neutral", "amused", "sad", "pain", "pleasure", "scream", "soft"].includes(req.body.performance)
    ? req.body.performance : "neutral";
  const emotional = performance !== "neutral";
  const accent = accentHint(req.body.language === "en" ? "en" : "es", region);
  const mood = {
    amused: "Reacciona con una risa o una sonrisa en la voz. [laughing] es un sonido, no una palabra.",
    sad: "Habla con llanto contenido. [crying] es un sonido, no la palabra llanto.",
    pain: "Deja oír el dolor en la voz y la respiración, luego di el diálogo. No pronuncies la palabra dolor ni leas una etiqueta.",
    pleasure: "Deja oír un gemido breve de placer en la voz, luego di el diálogo. No pronuncies la palabra gemido ni leas una etiqueta.",
    scream: "Suelta un grito corto y enseguida di el diálogo. [gasps] es un sonido, no una palabra.",
    soft: "Habla suave. [sigh] es un suspiro, no una palabra.",
  }[performance] || "Habla de forma conversacional y natural.";

  let lastStatus = 502;
  let quotaExceeded = false;
  const now = Date.now();
  const eligible = models.filter((model) => (quotaCooldownUntil.get(model) || 0) <= now);
  // A cooled-down Gemini model must not block the independent Cloud TTS provider.
  if (eligible.length === 0) quotaExceeded = true;

  const tryPreview = async (queue) => {
    for (const model of geminiAvailable ? queue : []) {
      const modelStartedAt = Date.now();
      try {
        const legacy = model === "gemini-3.1-flash-tts-preview" || model === "gemini-2.5-flash-preview-tts";
        const speechText = legacy
          ? `Interpreta solo el diálogo. ${accent} ${mood} [laughing], [crying], [gasps] y [sigh] indican sonidos; no leas las etiquetas ni agregues palabras. El placer y el dolor se oyen en la voz, sin decir esas palabras. DIÁLOGO:\n` + text
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
                    type: "text", text, annotations: [{ type: "speech_metadata", style: `${accent} Interpretación expresiva y conversacional. ${mood} [laughing], [crying], [gasps] y [sigh] son sonidos, no palabras.` }],
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
          return true;
        }
        console.warn("Insomnia speech provider returned no audio", model);
        lastStatus = 502;
      } catch (failure) {
        if (res.headersSent) return true;
        lastStatus = 504;
        console.warn("Insomnia speech provider timeout", model, failure.name);
      }
    }
    return false;
  };

  // Roleplay and Spanish stay on the same Gemini preview voice and accent.
  // Chirp is only the fallback: it drops laughs and, without es-VE/es-AR/etc., sounds like neutral es-US.
  // Cloud texttospeech Gemini (Agent Platform) stays behind GCP_GEMINI_TTS_TRIAL_ENABLED.
  const keepVoice = req.body.roleplay === true || emotional || req.body.language !== "en";
  const cooled = models.filter((model) => !eligible.includes(model));
  if (keepVoice && await tryPreview(eligible)) return;
  if (keepVoice && await tryPreview(cooled)) return;

  if (isChirpConfigured()) {
    const chirpStarted = Date.now();
    try {
      const result = await synthesizeChirp(plainText, req.body.voice, req.body.language, { region });
      if (result.status === 200) {
        writePcm(res, result.pcm, "chirp3-hd", startedAt);
        return;
      }
      lastStatus = result.status;
      quotaExceeded ||= result.status === 429;
      console.warn("Insomnia speech primary chirp3-hd", result.status, "after_ms", Date.now() - chirpStarted);
    } catch (failure) {
      lastStatus = 502;
      console.warn("Insomnia speech primary chirp3-hd failed", failure?.name || "Error", "after_ms", Date.now() - chirpStarted);
    }
  }
  if (!keepVoice && await tryPreview(eligible)) return;
  if (cloudGeminiTrialEnabled() && isChirpConfigured() && Date.now() >= cloudGeminiCooldownUntil) {
    const cloudStarted = Date.now();
    try {
      const result = await synthesizeCloudGemini(text, req.body.voice, req.body.language, { performance });
      if (result.status === 200) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();
        sendEvent(res, { type: "speech.provider", provider: "gemini-cloud" });
        console.info("Insomnia speech first_audio gemini-cloud total_ms", Date.now() - startedAt);
        for (let offset = 0; offset < result.pcm.length; offset += 32_768) {
          sendEvent(res, { type: "speech.audio.delta", audio: result.pcm.subarray(offset, offset + 32_768).toString("base64") });
        }
        sendEvent(res, { type: "speech.audio.done" });
        res.end();
        console.info("Insomnia speech complete gemini-cloud total_ms", Date.now() - startedAt);
        return;
      }
      if ([400, 403, 404].includes(result.status)) cloudGeminiCooldownUntil = Date.now() + 15 * 60_000;
      else if (result.status === 429) cloudGeminiCooldownUntil = Date.now() + 60_000;
      console.warn("Insomnia speech provider gemini-cloud", result.status, "after_ms", Date.now() - cloudStarted);
    } catch (failure) {
      cloudGeminiCooldownUntil = Date.now() + 60_000;
      console.warn("Insomnia speech provider gemini-cloud failed", failure?.name || "Error", "after_ms", Date.now() - cloudStarted);
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
