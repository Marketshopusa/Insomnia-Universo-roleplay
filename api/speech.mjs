import { detectPhysicalSoundEvents } from "../src/lib/soundbank/matcher.mjs";
import { authenticationFailure } from "./_auth.mjs";
import { synthesizeExpressiveScene } from "../src/lib/expressiveAudio.mjs";
import { prepareExpressiveSpeech, hasVocalCue } from "../src/lib/expressiveSpeech.mjs";
import { vocalSample } from "../src/lib/vocalSamples.mjs";
import { explainGeminiFailure, isGeminiConfigured, streamGeminiSpeech, synthesizeGemini, removePerformanceCues, previewVoice, splitSentences } from "./_geminiTts.mjs";

export const maxDuration = 60;


function sendEvent(res, event) {
  res.write("data: " + JSON.stringify(event) + "\n\n");
}

function openSpeech(res, provider, startedAt) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  sendEvent(res, { type: "speech.provider", provider });
  console.info("Insomnia speech first_audio", provider, "total_ms", Date.now() - startedAt);
}

function writePcmChunks(res, pcm) {
  for (let offset = 0; offset < pcm.length; offset += 32_768) {
    sendEvent(res, { type: "speech.audio.delta", audio: pcm.subarray(offset, offset + 32_768).toString("base64") });
  }
}

function finishSpeech(res, provider, startedAt) {
  sendEvent(res, { type: "speech.audio.done" });
  res.end();
  console.info("Insomnia speech complete", provider, "total_ms", Date.now() - startedAt);
}

function writePcm(res, pcm, provider, startedAt) {
  openSpeech(res, provider, startedAt);
  writePcmChunks(res, pcm);
  finishSpeech(res, provider, startedAt);
}

// In-memory sliding window rate limiter for speech
const SPEECH_WINDOW_MS = 60_000;
const MAX_SPEECH_PER_WINDOW = 40;
const speechHits = new Map();

function isSpeechRateLimited(identifier) {
  if (!identifier) return false;
  const now = Date.now();
  const entry = speechHits.get(identifier) || { count: 0, resetAt: now + SPEECH_WINDOW_MS };
  if (now > entry.resetAt) {
    entry.count = 1;
    entry.resetAt = now + SPEECH_WINDOW_MS;
    speechHits.set(identifier, entry);
    if (speechHits.size > 1500) {
      for (const [k, v] of speechHits.entries()) {
        if (now > v.resetAt) speechHits.delete(k);
      }
    }
    return false;
  }
  entry.count += 1;
  speechHits.set(identifier, entry);
  return entry.count > MAX_SPEECH_PER_WINDOW;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  const startedAt = Date.now();
  const clientIp = String(req.headers["x-forwarded-for"] || "").split(",")[0]?.trim() || req.socket?.remoteAddress || "client";
  if (isSpeechRateLimited(clientIp)) {
    return res.status(429).json({ error: "rate_limited", message: "Demasiadas solicitudes de audio simultáneas. Espera unos segundos." });
  }

  const failure = await authenticationFailure(req);
  if (failure) return res.status(failure.status).json({ error: failure.error, message: failure.message });
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
      message: "El servicio de voz neural no está configurado en este sitio.",
    });
  }
  const raw = typeof req.body?.text === "string" ? req.body.text : "";
  // Normalizar letras repetidas alargadas ("Mmmmmm", "Aaaah", "Ooooh") para que el motor no las deletree
  const normalizedRaw = raw
    .replace(/\b([mM]){3,}\b/gi, "Mmm")
    .replace(/\b([aA]){4,}\b/gi, "Aaah")
    .replace(/\b([oO]){4,}\b/gi, "Oooh")
    .replace(/\b([eE]){4,}\b/gi, "Eeeh");
  const limited = normalizedRaw.slice(0, 1400);
  // Prepare expressive speech parsing vocal reactions (*gime*, *se ríe*, *suspira*, *llora*) from original marked text
  const expression = req.body?.roleplay ? prepareExpressiveSpeech(limited, { roleplay: true }) : null;
  const text = (expression?.text && expression.text.trim()) || limited.replace(/[*_#]/g, "").replace(/\s+/g, " ").trim();
  const plainText = removePerformanceCues(text);
  if (!plainText && !expression?.reactions.length && !hasVocalCue(text)) return res.status(400).json({ error: "missing_text" });
  const region = typeof req.body.region === "string" ? req.body.region : "mx";
  const performance = (expression?.performance && expression.performance !== "neutral")
    ? expression.performance
    : (["neutral", "warm", "surprised", "amused", "sad", "pain", "pleasure", "scream", "soft"].includes(req.body.performance)
        ? req.body.performance : (expression?.performance || "neutral"));
  const provider = "gemini-2.5-flash-tts";
  let opened = false;

  const synthesizePieceWithRetry = async (pieceText, v, lang, opts) => {
    const cleaned = String(pieceText || "").replace(/[*_#]/g, "").replace(/\s+/g, " ").trim();
    const isReactionOnly = Boolean(opts?.expression?.reactions?.length && opts?.expression?.segments?.length === 1);
    const speakable = removePerformanceCues(cleaned).replace(/[^\p{L}\p{N}]+/gu, "");
    if (!speakable && !isReactionOnly) {
      return { status: 200, pcm: Buffer.alloc(1920) };
    }
    let resPiece = await synthesizeGemini(cleaned, v, lang, opts);
    if (resPiece.status === 200 && resPiece.pcm?.length) return resPiece;
    if (isReactionOnly) {
      const fallbackClip = vocalSample(previewVoice(v), lang, opts.expression.reactions[0].event, opts.expression.reactions[0].direction, region);
      return fallbackClip ? { status: 200, pcm: fallbackClip } : resPiece;
    }
    const plainPiece = removePerformanceCues(cleaned).trim();
    if (plainPiece) {
      resPiece = await synthesizeGemini(plainPiece, v, lang, { ...opts, performance: opts?.performance || performance, expression: undefined });
      if (resPiece.status === 200 && resPiece.pcm?.length) return resPiece;
    }
    return resPiece;
  };

  try {
    // 1. Si hay reacciones acústicas marcadas (*gime*, *se ríe*, *suspira*, *llora*), inyectar muestras acústicas hiperrealistas y streamear de inmediato
    if (expression && (expression.reactions.length || expression.segments.some((part) => part.kind === "narration" && detectPhysicalSoundEvents(part.text).length))) {
      try {
        let streamedChunks = 0;
        const scene = await synthesizeExpressiveScene(expression, req.body.voice, req.body.language, {
          performance,
          region,
          resolvedVoice: previewVoice(req.body.voice),
          samples: (v, lang, event, dir) => vocalSample(v, lang, event, dir, region),
          synthesize: synthesizePieceWithRetry,
          deadlineMs: 30_000,
          onAudio: (pcmChunk, segment) => {
            if (!opened) {
              opened = true;
              openSpeech(res, provider, startedAt);
            }
            sendEvent(res, { type: "speech.segment", ...segment });
            writePcmChunks(res, pcmChunk);
            streamedChunks += 1;
          },
        });
        if (streamedChunks > 0) {
          if (scene.status !== 200) {
            sendEvent(res, { type: "speech.error", message: "No se pudo completar el audio con la voz seleccionada." });
            res.end();
            return;
          }
          finishSpeech(res, provider, startedAt);
          return;
        }
        if (scene.status !== 200) {
          return res.status(scene.status === 429 ? 429 : 502).json({ error: "expressive_audio_failed", message: "No se pudo completar una expresión con la voz seleccionada." });
        }
        if (scene.status === 200 && scene.pcm?.length) {
          writePcm(res, scene.pcm, provider, startedAt);
          return;
        }
      } catch (sceneErr) {
        if (opened) {
          sendEvent(res, { type: "speech.error", message: "No se pudo completar el audio con la voz seleccionada." });
          res.end();
          return;
        }
        console.warn("synthesizeExpressiveScene failed:", sceneErr?.message);
        return res.status(502).json({ error: "expressive_audio_failed", message: "No se pudo completar una expresión con la voz seleccionada." });
      }
    }

    // 2. Si se solicitó streaming progresivo y no hay reacciones complejas, emitir deltas de audio de inmediato
    if (req.body?.stream && !opened) {
      let streamedAny = false;
      try {
        const streamResult = await streamGeminiSpeech(text, req.body.voice, req.body.language, {
          performance,
          region,
          expression,
          firstAudioMs: 1200,
          onAudio: (pcmChunk, segment) => {
            if (!opened) {
              opened = true;
              openSpeech(res, provider, startedAt);
            }
            writePcmChunks(res, pcmChunk);
            streamedAny = true;
          },
        });
        if (streamedAny) {
          if (streamResult.partial) {
            sendEvent(res, { type: "speech.error", message: "La reproducción de voz se interrumpió." });
            res.end();
            return;
          }
          finishSpeech(res, provider, startedAt);
          return;
        }
      } catch (streamErr) {
        console.warn("streamGeminiSpeech error, falling back to unary:", streamErr?.message || streamErr);
      }
    }

    // 3. Si el cliente solicita streaming y el texto es largo, sintetizar el primer fragmento de inmediato para first_audio < 1s
    if (req.body?.stream && !opened) {
      const chunks = splitSentences(text);
      if (chunks.length > 1) {
        try {
          const firstChunk = await synthesizePieceWithRetry(chunks[0], req.body.voice, req.body.language, { performance, region, expression });
          if (firstChunk.status === 200 && firstChunk.pcm?.length) {
            opened = true;
            openSpeech(res, provider, startedAt);
            writePcmChunks(res, firstChunk.pcm);
            const remainingText = chunks.slice(1).join(" ");
            const secondChunk = await synthesizePieceWithRetry(remainingText, req.body.voice, req.body.language, { performance, region, expression });
            if (secondChunk.status === 200 && secondChunk.pcm?.length) {
              writePcmChunks(res, secondChunk.pcm);
            } else {
              sendEvent(res, { type: "speech.error", message: "No se pudo completar la voz seleccionada." });
              res.end();
              return;
            }
            finishSpeech(res, provider, startedAt);
            return;
          }
        } catch (chunkErr) {
          console.warn("Chunked synthesis fallback to full track:", chunkErr);
        }
      }
    }

    // 4. Sintetizar la escena completa como un solo track continuo para que el relato, respiración y diálogo fluyan sin pausas mecánicas
    const expressive = await synthesizePieceWithRetry(text, req.body.voice, req.body.language, { performance, region, expression });
    if (expressive.status !== 200) {
      console.warn("Insomnia speech gemini-2.5-flash-tts", expressive.status, expressive.detail || "", "after_ms", Date.now() - startedAt);
      const status = expressive.status === 429 ? 429 : expressive.status === 403 ? 403 : 502;
      return res.status(status).json({
        error: expressive.status === 429 ? "tts_quota_exhausted" : "tts_unavailable",
        message: explainGeminiFailure(expressive.status, expressive.detail),
      });
    }
    writePcm(res, expressive.pcm, provider, startedAt);
    return;
  } catch (failure) {
    console.warn("Insomnia speech gemini failed", failure?.message || failure?.name || "Error", "after_ms", Date.now() - startedAt);
    if (opened) {
      sendEvent(res, { type: "speech.error", message: "La reproducción de voz se interrumpió." });
      res.end();
      return;
    }
    return res.status(502).json({
      error: "tts_unavailable",
      message: "La voz no pudo reproducir esta línea.",
    });
  }
}
