import { synthesizeExpressiveScene } from "../src/lib/expressiveAudio.mjs";
import { prepareExpressiveSpeech, hasVocalCue } from "../src/lib/expressiveSpeech.mjs";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl, publishableKey } from "./config.mjs";
import { explainGeminiFailure, isGeminiConfigured, streamGeminiSpeech, synthesizeGemini, removePerformanceCues, previewVoice, splitSentences } from "./geminiTts.mjs";

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
  const limited = raw.slice(0, 1400);
  const expression = req.body?.roleplay ? prepareExpressiveSpeech(limited) : null;
  const text = expression ? expression.text : limited.replace(/[*_#]/g, "").replace(/\s+/g, " ").trim();
  const plainText = removePerformanceCues(text);
  if (!plainText && !expression?.reactions.length && !hasVocalCue(text)) return res.status(400).json({ error: "missing_text" });
  const region = typeof req.body.region === "string" ? req.body.region : "mx";
  const performance = ["neutral", "warm", "surprised", "amused", "sad", "pain", "pleasure", "scream", "soft"].includes(req.body.performance)
    ? req.body.performance : "neutral";
  const provider = "gemini-2.5-flash-tts";
  let opened = false;
  try {
    // Sentence-chunked streaming via synthesizeGemini for instant first playback latency (< 1s)
    const sentences = splitSentences(text);
    if (sentences.length > 1) {
      const results = new Array(sentences.length);
      let nextEmit = 0;
      let failed = null;

      const emitReady = () => {
        while (nextEmit < sentences.length && results[nextEmit]) {
          if (!opened) {
            opened = true;
            openSpeech(res, provider, startedAt);
          }
          writePcmChunks(res, results[nextEmit]);
          nextEmit++;
        }
      };

      // Fast-path: Synthesize sentence 0 first to ensure immediate playback in ~600ms
      const first = await synthesizeGemini(sentences[0], req.body.voice, req.body.language, { performance, region, expression });
      if (first.status !== 200 || !first.pcm?.length) {
        const status = first.status === 429 ? 429 : first.status === 403 ? 403 : 502;
        return res.status(status).json({
          error: first.status === 429 ? "tts_quota_exhausted" : "tts_unavailable",
          message: explainGeminiFailure(first.status, first.detail),
        });
      }
      results[0] = first.pcm;
      emitReady();

      // Synthesize remaining sentences with concurrent workers in background while sentence 0 plays
      let cursor = 1;
      const worker = async () => {
        while (!failed && cursor < sentences.length) {
          const idx = cursor++;
          const piece = await synthesizeGemini(sentences[idx], req.body.voice, req.body.language, { performance, region, expression });
          if (piece.status !== 200 || !piece.pcm?.length) {
            failed = piece;
            break;
          }
          results[idx] = piece.pcm;
          emitReady();
        }
      };

      await Promise.all([worker(), worker()]);

      if (opened) {
        finishSpeech(res, provider, startedAt);
        return;
      }
    }

    if (expression?.reactions.length) {
      const scene = await synthesizeExpressiveScene(expression, req.body.voice, req.body.language, {
        region,
        resolvedVoice: previewVoice(req.body.voice),
        synthesize: synthesizeGemini,
        onAudio(pcm) {
          if (!pcm?.length) return;
          if (!opened) {
            opened = true;
            openSpeech(res, provider, startedAt);
          }
          writePcmChunks(res, pcm);
        },
      });
      if (scene.status !== 200) {
        if (!opened) {
          const status = scene.status === 429 ? 429 : scene.status === 403 ? 403 : 502;
          return res.status(status).json({
            error: scene.status === 429 ? "tts_quota_exhausted" : "tts_unavailable",
            message: explainGeminiFailure(scene.status, scene.detail),
          });
        }
      }
      if (opened) {
        finishSpeech(res, provider, startedAt);
      } else {
        writePcm(res, scene.pcm, provider, startedAt);
      }
      return;
    }

    const expressive = await synthesizeGemini(text, req.body.voice, req.body.language, { performance, region, expression });
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
    return res.status(502).json({
      error: "tts_unavailable",
      message: "Gemini 2.5 Flash TTS no pudo hablar esta línea.",
    });
  }
}
