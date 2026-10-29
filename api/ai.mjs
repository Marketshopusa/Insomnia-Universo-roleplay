const DANGLING_TAIL_REGEX = /\b(?:de|del|al|a|en|con|por|para|sin|sobre|entre|hacia|hasta|como|mientras|cuando|que|y|e|o|u|ni|pero|un|una|unos|unas|el|la|los|las|su|sus|mi|mis|tu|tus|me|te|se|nos|le|les|lo)\s*$/iu;

function cleanCueText(rawInner, maxWords = 22) {
  const firstSentence = rawInner
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?…])\s+/)[0]
    .replace(/[.!?…]+$/, "")
    .trim();
  const words = firstSentence.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return firstSentence;
  const clauses = firstSentence.split(/[,;]/);
  let clauseAcc = "";
  for (const c of clauses) {
    const candidate = clauseAcc ? `${clauseAcc}, ${c.trim()}` : c.trim();
    if (candidate.split(/\s+/).filter(Boolean).length <= maxWords) {
      clauseAcc = candidate;
    } else {
      break;
    }
  }
  let sliced = clauseAcc && clauseAcc.split(/\s+/).filter(Boolean).length >= 8
    ? clauseAcc
    : words.slice(0, maxWords).join(" ");
  while (DANGLING_TAIL_REGEX.test(sliced) && sliced.includes(" ")) {
    sliced = sliced.replace(/\s+\S+$/, "").trim();
  }
  return sliced.replace(/[,;:\s]+$/, "").trim();
}

export function enforceDialogueRatio(text, dialPct = 80, narrPct = 20) {
  if (!text) return text;
  const regex = /\*([^*]+)\*/g;
  const matches = [];
  let m;
  while ((m = regex.exec(text)) !== null) {
    matches.push({ full: m[0], inner: m[1].trim(), index: m.index });
  }
  if (matches.length === 0) return text;

  let totalNarrWords = 0;
  for (const b of matches) {
    totalNarrWords += b.inner.split(/\s+/).filter(Boolean).length;
  }

  // Si las acotaciones superan 28 palabras en total o hay más de 2 acotaciones, equilibrar sin mutilar frases
  if (totalNarrWords > 28 || matches.length > 2) {
    let result = text;
    for (let i = 0; i < matches.length; i++) {
      const b = matches[i];
      if (i >= 2) {
        // Máximo 2 acotaciones para no saturar el diálogo
        result = result.replace(b.full, "");
      } else {
        const cleaned = cleanCueText(b.inner, 20);
        result = result.replace(b.full, cleaned ? `*${cleaned}*` : "");
      }
    }
    return result.replace(/[ \t]{2,}/g, " ").replace(/\n{2,}/g, "\n").trim();
  }
  return text;
}

import { createClient } from "@supabase/supabase-js";
import { supabaseUrl as BASE, publishableKey as KEY } from "./config.mjs";
import { slangInstruction, speechLocale } from "./regions.mjs";

// In-memory sliding window rate limiter
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 45;
const clientHits = new Map();

export function isRateLimited(identifier) {
  if (!identifier) return false;
  const now = Date.now();
  const entry = clientHits.get(identifier) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  if (now > entry.resetAt) {
    entry.count = 1;
    entry.resetAt = now + RATE_LIMIT_WINDOW_MS;
    clientHits.set(identifier, entry);
    if (clientHits.size > 2000) {
      for (const [k, v] of clientHits.entries()) {
        if (now > v.resetAt) clientHits.delete(k);
      }
    }
    return false;
  }
  entry.count += 1;
  clientHits.set(identifier, entry);
  return entry.count > MAX_REQUESTS_PER_WINDOW;
}

export const maxDuration = 60;
const send = (res, status, value) => res.status(status).json(value);
async function authenticated(req) {
  const isDev = process.env.NODE_ENV !== "production" && !process.env.VERCEL;
  if (isDev) return true;
  const jwt = String(req.headers?.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt || !KEY) return false;
  try {
    const client = createClient(BASE, KEY, { auth: { persistSession: false } });
    const { data, error } = await client.auth.getUser(jwt);
    if (!error && data?.user) return true;
  } catch {
    // Supabase auth connection error
  }
  return false;
}
export function generationConfigFor(candidate, settings, options = {}, thinking = true) {
  if (!thinking || !options.fastReply) return settings;
  if (candidate.startsWith("gemini-3.")) return { ...settings, thinkingConfig: { thinkingLevel: "low" } };
  return { ...settings, thinkingConfig: { thinkingBudget: 0 } };
}
export function isRefusal(text) {
  if (!text) return true;
  const l = text.toLowerCase().trim();
  const refusalPhrases = [
    "no puedo continuar con esta conversación",
    "no puedo continuar esta conversación",
    "no puedo seguir con esta conversación",
    "no voy a seguir con esta escena",
    "no voy a seguir con",
    "no voy a continuar",
    "no voy a participar en esta escena",
    "no voy a participar",
    "no participo en ese tipo",
    "no participo en este tipo",
    "no hago ese tipo de roleplay",
    "no hago este tipo de roleplay",
    "da igual la edad de los personajes",
    "si quieres seguir roleando",
    "dime qué te apetece",
    "dime que te apetece",
    "crear una historia con personajes sin lazo familiar",
    "cambiar a otro género o escenario",
    "cambiar a otro genero o escenario",
    "relación incestuosa",
    "relacion incestuosa",
    "contenido incestuoso",
    "no puedo participar en este tipo",
    "no puedo generar este tipo",
    "no puedo crear contenido explícito",
    "no puedo cumplir con esta solicitud",
    "no puedo procesar esta solicitud",
    "no me siento cómodo",
    "no me siento cómoda",
    "en qué más te puedo echar una mano",
    "en que mas te puedo echar una mano",
    "empezar una historia distinta",
    "ayudarte con escritura creativa en otro género",
    "ayudarte con escritura creativa en otro genero",
    "hay algo más en lo que pueda ayudarte",
    "algo más en lo que pueda ayudarte",
    "algo más en lo que te pueda ayudar",
    "como modelo de lenguaje",
    "como inteligencia artificial",
    "como ia,",
    "soy un modelo de lenguaje",
    "soy una ia",
    "i cannot fulfill this request",
    "i cannot continue with this conversation",
    "i cannot continue this conversation",
    "i am unable to continue",
    "i am unable to generate",
    "sexually explicit",
    "against my safety guidelines",
    "políticas de seguridad",
    "pautas de seguridad",
    "directrices de seguridad",
    "puedo ayudarte con algún otro tema",
    "prefiero no continuar con este tema",
    "no estoy capacitado para generar",
  ];
  return refusalPhrases.some((phrase) => l.includes(phrase));
}

export async function generateLocalLlama(messages, options = {}) {
  try {
    // En Vercel no existe el servidor local de PC, omitir instantáneamente para no esperar timeouts inútiles
    if (process.env.VERCEL) return null;
    const fetchImpl = options.fetchImpl || fetch;
    // Ensure strict alternation for Jinja templates in local llama-server
    const sanitizedMessages = [...messages];
    if (sanitizedMessages.length > 1 && sanitizedMessages[1]?.role === "assistant") {
      sanitizedMessages.splice(1, 0, { role: "user", content: "[Inicio de la escena]" });
    }
    const response = await fetchImpl("http://127.0.0.1:8788/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "magnum-v4-12b",
        messages: sanitizedMessages,
        max_tokens: Math.max(350, options.maxTokens || 450),
        temperature: options.temperature ?? 0.68,
        repeat_penalty: options.repeat_penalty ?? 1.04,
        presence_penalty: 0.0,
        frequency_penalty: 0.0,
        repeat_last_n: 256,
      }),
      signal: AbortSignal.timeout(options.timeoutMs || 30000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    let content = data?.choices?.[0]?.message?.content?.trim();
    if (content) {
      content = content.replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u30ff]/g, "").trim();
      if (content.length > 5 && !isRefusal(content)) {
        if (options.isRepeated && options.isRepeated(content)) return null;
        if (options.validate && !options.validate(content)) return null;
        return content;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function generateOpenRouter(messages, options = {}) {
  const isCustomKey = Boolean(typeof options.apiKey === "string" && options.apiKey.trim());
  const apiKey = (isCustomKey ? options.apiKey.trim() : null) || process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  // Priorizar modelos sin censura para rol adulto
  const defaultModels = [
    "anthracite-org/magnum-v4-72b",
    "sao10k/l3.3-euryale-70b",
    "nvidia/nemotron-3.5-lightning:free",
    "nvidia/nemotron-3.5-super-vl:free",
  ];
  const models = [...(options.models || defaultModels)];
  if (!models.includes("nvidia/nemotron-3.5-lightning:free")) {
    models.push("nvidia/nemotron-3.5-lightning:free");
  }
  if (!models.includes("nvidia/nemotron-3.5-super-vl:free")) {
    models.push("nvidia/nemotron-3.5-super-vl:free");
  }

  const fetchImpl = options.fetchImpl || fetch;
  let paidModelsBlocked = false;
  for (const model of models) {
    if (paidModelsBlocked && !model.endsWith(":free")) continue;
    try {
      const response = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://insomnia-universo-roleplay.vercel.app",
          "X-Title": "Insomnia Universo Roleplay"
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: options.maxTokens || 450,
          temperature: options.temperature ?? 0.8,
          // CRITICAL: NEVER set presence_penalty or frequency_penalty > 0 on LLaMA 3.x / Magnum in Spanish!
          presence_penalty: 0,
          frequency_penalty: 0,
          reasoning: { max_tokens: 0 },
        }),
        signal: AbortSignal.timeout(options.timeoutMs || 6000),
      });
      if (!response.ok) {
        console.warn("OpenRouter model error", model, response.status);
        if (response.status === 402) {
          console.warn("OpenRouter paid model skipped due to 402 (sin saldo prepagado), filtrando al instante modelos gratuitos:", model);
          paidModelsBlocked = true;
          continue;
        }
        continue;
      }
      const data = await response.json();
      let content = data?.choices?.[0]?.message?.content?.trim();
      if (!content && typeof data?.choices?.[0]?.message?.reasoning === "string") {
        content = data.choices[0].message.reasoning.trim();
      }
      if (content && content.length > 5 && !isRefusal(content)) {
        if (options.isRepeated && options.isRepeated(content)) {
          console.warn("OpenRouter candidate rejected because it repeated previous dialogue, trying next model:", model);
          continue;
        }
        if (options.validate && !options.validate(content)) {
          console.warn("OpenRouter candidate rejected by validation, trying next model:", model);
          continue;
        }
        return content;
      }
    } catch (e) {
      console.warn("OpenRouter request failed for", model, e.message);
    }
  }
  return null;
}

export async function generateNvidia(messages, options = {}) {
  const apiKey = (typeof options.apiKey === "string" && options.apiKey.trim()) || process.env.NVIDIA_API_KEY;
  if (!apiKey) return null;
  const models = options.models || ["meta/llama-3.2-11b-vision-instruct"];
  const fetchImpl = options.fetchImpl || fetch;
  let fallbackCandidate = null;
  let anyCandidate = null;
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const temp = i >= 2 ? Math.min(0.95, (options.temperature ?? 0.82) + 0.08) : (options.temperature ?? 0.82);
    try {
      const response = await fetchImpl("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: options.maxTokens || 450,
          temperature: temp,
          
        }),
        signal: AbortSignal.timeout(options.timeoutMs || 4000),
      });
      if (!response.ok) {
        console.warn("Nvidia model error", model, response.status);
        continue;
      }
      const data = await response.json();
      const msg = data?.choices?.[0]?.message;
      let content = msg?.content?.trim();
      if (!content && typeof msg?.reasoning_content === "string") {
        const reasoning = msg.reasoning_content.trim();
        const match = reasoning.match(/(?:Respuesta|Output|Spanish|Scarlett|Personaje):\s*([\s\S]+)$/i);
        if (match && match[1]?.trim()) content = match[1].trim();
      }
      if (content && content.length > 5 && !isRefusal(content)) {
        if (options.isRepeated && options.isRepeated(content)) {
          console.warn("Nvidia candidate rejected because it repeated previous dialogue, trying next attempt:", model);
          continue;
        }
        if (!anyCandidate) anyCandidate = content;
        if (!fallbackCandidate) {
          fallbackCandidate = content;
        }
        if (options.validate && !options.validate(content)) {
          console.warn("Nvidia candidate rejected by validation, trying next model:", model);
          continue;
        }
        return content;
      }
    } catch (e) {
      console.warn("Nvidia request failed for", model, e.message);
    }
  }
  return fallbackCandidate || anyCandidate;
}

export async function generate(model, parts, settings = {}, options = {}) {
  const key = (typeof options.apiKey === "string" && options.apiKey.trim()) || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key || key === "[SENSITIVE]") throw Object.assign(new Error("Gemini no está configurado en Insomnia (Vercel)."), { status: 503, code: "gemini_not_configured" });
  const fetchImpl = options.fetchImpl || fetch;
  const choices = [...new Set([model, ...(options.fallbackModels || ["gemini-flash-latest", "gemini-2.5-pro", "gemini-pro-latest"])])];
  let lastError;
  for (const candidate of choices) {
    let allowThinking = true;
    let allowSafety = true;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const generationConfig = generationConfigFor(candidate, settings, options, allowThinking);
        const safetySettings = [
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ];
        const response = await fetchImpl("https://generativelanguage.googleapis.com/v1beta/models/" + candidate + ":generateContent", {
          method: "POST",
          headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: options.contents || [{ role: "user", parts }],
            ...(options.systemInstruction ? { systemInstruction: { parts: [{ text: options.systemInstruction }] } } : {}),
            ...(options.adultMode && allowSafety ? { safetySettings } : {}),
            generationConfig,
          }),
          signal: AbortSignal.timeout(options.timeoutMs || 25000),
        });
        const data = await response.json();
        if (!response.ok) {
          console.warn("Insomnia AI upstream", candidate, response.status, data?.error?.status);
          const message = data?.error?.message || "";
          if (allowThinking && response.status === 400 && generationConfig.thinkingConfig) {
            allowThinking = false;
            continue;
          }
          if (allowSafety && response.status === 400 && /safety/i.test(message)) {
            allowSafety = false;
            continue;
          }
          if ((response.status === 503 || response.status === 429) && attempt < 2) {
            console.warn(`Insomnia AI transient ${response.status} on ${candidate}, retrying in ${(attempt + 1) * 400}ms...`);
            await new Promise((r) => setTimeout(r, (attempt + 1) * 400));
            continue;
          }
          lastError = Object.assign(new Error(message || "Gemini no respondió."), {
            status: response.status, code: response.status === 429 ? "rate_limited" : "ai_unavailable",
          });
          const retryAnotherModel = [400, 404, 429, 500, 502, 503, 504].includes(response.status)
            || ((options.allowEmpty || options.retryBadRequest) && response.status === 400);
          if (retryAnotherModel) break;
          throw lastError;
        }
        const blockReason = data.promptFeedback?.blockReason || (["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST"].includes(data.candidates?.[0]?.finishReason) ? data.candidates[0].finishReason : null);
        if (blockReason) {
          console.warn("Insomnia AI content blocked", candidate, blockReason);
          throw Object.assign(new Error(blockReason === "PROHIBITED_CONTENT"
            ? "Gemini rechazó esta escena por una restricción propia del proveedor."
            : "Gemini bloqueó esta escena. El mensaje permanece disponible para que puedas editarlo."), {
            status: 422, code: "content_blocked", blockReason,
          });
        }
        const content = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("").trim();
        if (!content) {
          if (options.allowEmpty) return "";
          console.warn("Insomnia AI empty output", candidate, "keys", Object.keys(data || {}), "feedback", data.promptFeedback?.blockReason, "candidateCount", data.candidates?.length, "finish", data.candidates?.[0]?.finishReason, "thoughts", data.usageMetadata?.thoughtsTokenCount);
          lastError = Object.assign(new Error("Gemini no devolviÃ³ texto."), { status: 502, code: "ai_unavailable" });
          break;
        }
        if (options.validate && !options.validate(content)) {
          lastError = Object.assign(new Error("La respuesta saliÃ³ del personaje o cambiÃ³ de idioma."), { status: 502, code: "off_role" });
          console.warn("Insomnia AI rejected off-role output", candidate);
          break;
        }
        return content;
      } catch (error) {
        if (error.name !== "TimeoutError") throw error;
        lastError = Object.assign(new Error("Gemini tardÃ³ demasiado en responder."), { status: 504, code: "ai_timeout" });
        break;
      }
    }
  }
  throw lastError;
}

export function cleanTranscript(text) {
  const cleaned = String(text || "")
    .trim()
    .replace(/^(transcripci[oó]n|transcript)\s*:\s*/i, "")
    .replace(/^["“”']+|["“”']+$/g, "")
    .trim();
  if (/^(vac[ií]o|empty|\[silence\]|\(silence\)|\(silencio\)|\[silencio\])$/i.test(cleaned)) return "";
  return cleaned;
}

/** The microphone file alone. A chat prompt makes Gemini answer "hola, ¿qué tal?" instead of hearing the audio. */
export function speechToTextBody(fileUri, mimeType, languageCode) {
  return {
    contents: [{ role: "user", parts: [{ fileData: { fileUri, mimeType } }] }],
    generationConfig: {
      audioTranscriptionConfig: { languageCodes: languageCode ? [languageCode] : [] },
    },
  };
}

function transcriptFrom(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return cleanTranscript(parts.map((part) => part.text || "").join(""));
}

export function interactionsTranscriptionBody(base64Audio, mimeType = "audio/wav", languageCode = "es-419") {
  return {
    model: "gemini-3.5-transcribe",
    input: [
      {
        type: "audio",
        data: base64Audio,
        mime_type: mimeType,
      },
    ],
    generation_config: {
      transcription_config: {
        language_codes: languageCode ? [languageCode] : ["es-419"],
      },
    },
  };
}

export function interactionTranscript(data) {
  if (!data || typeof data !== "object") return "";
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return cleanTranscript(data.output_text);
  }
  if (typeof data.text === "string" && data.text.trim()) {
    return cleanTranscript(data.text);
  }
  if (Array.isArray(data.steps)) {
    for (let i = data.steps.length - 1; i >= 0; i--) {
      const step = data.steps[i];
      if (step?.type === "model_output" || step?.type === "output" || !step?.type) {
        if (Array.isArray(step.content)) {
          const text = step.content
            .map((item) => (typeof item === "string" ? item : item?.text || ""))
            .join("");
          if (text.trim()) return cleanTranscript(text);
        } else if (typeof step.content === "string" && step.content.trim()) {
          return cleanTranscript(step.content);
        } else if (typeof step.text === "string" && step.text.trim()) {
          return cleanTranscript(step.text);
        }
      }
    }
  }
  if (Array.isArray(data.outputs)) {
    const text = data.outputs.map((o) => (typeof o === "string" ? o : o?.text || "")).join("");
    if (text.trim()) return cleanTranscript(text);
  }
  return "";
}

export async function transcribeAudio(body, options = {}) {
  if (typeof body.audio !== "string" || body.audio.length < 64 || body.audio.length > 12000000) {
    throw Object.assign(new Error("El audio de la llamada no llegó completo."), { status: 400, code: "invalid_audio" });
  }
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key || key === "[SENSITIVE]") {
    throw Object.assign(new Error("Gemini no está configurado para oír la llamada."), { status: 503, code: "gemini_not_configured" });
  }
  const fetchImpl = options.fetchImpl || fetch;
  const mimeType = body.mimeType || "audio/wav";
  const bytes = Buffer.from(body.audio, "base64");
  if (bytes.length < 2048) return { text: "" };
  const language = body.language === "en" ? "en" : "es";
  const locale = language === "en" ? "en-US" : (body.region === "plain" || body.region === "es" ? "es-ES" : "es-419");

  const totalDeadlineMs = options.totalTimeoutMs || options.timeoutMs || 15000;
  const startTime = Date.now();
  const remainingTime = () => Math.max(1000, totalDeadlineMs - (Date.now() - startTime));
  const attemptErrors = [];

  // 1. Primary: gemini-3.5-transcribe via Interactions API (POST /v1beta/interactions)
  try {
    const interactionPayload = interactionsTranscriptionBody(body.audio, mimeType, locale);
    const response = await fetchImpl("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(interactionPayload),
      signal: AbortSignal.timeout(remainingTime()),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      return { text: interactionTranscript(data) };
    }
    const message = data?.error?.message || response.statusText || "Interactions call failed";
    console.warn("Insomnia STT attempt error (interactions):", response.status, message);
    attemptErrors.push({ strategy: "interactions:gemini-3.5-transcribe", status: response.status, message });
  } catch (err) {
    const message = err.name === "TimeoutError" ? "Tiempo agotado en transcripción." : (err.message || String(err));
    console.warn("Insomnia STT interactions exception:", message);
    attemptErrors.push({ strategy: "interactions:gemini-3.5-transcribe", status: err.status || 500, message });
  }

  // 2. Fallback: generateContent on gemini-2.5-flash with inline audio (if remaining time allows and fallback not disabled)
  if (remainingTime() > 2000 && !options.noFallback) {
    try {
      const fallbackResponse = await fetchImpl("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { inlineData: { mimeType, data: body.audio } },
              { text: "Transcribe the spoken audio verbatim in " + locale + ". Output only the transcription, nothing else. If silence, output empty." }
            ]
          }],
          generationConfig: { temperature: 0.1 }
        }),
        signal: AbortSignal.timeout(remainingTime()),
      });
      const fallbackData = await fallbackResponse.json().catch(() => ({}));
      if (fallbackResponse.ok) {
        return { text: transcriptFrom(fallbackData) };
      }
      const message = fallbackData?.error?.message || fallbackResponse.statusText;
      console.warn("Insomnia STT fallback error:", fallbackResponse.status, message);
      attemptErrors.push({ strategy: "generateContent:gemini-2.5-flash", status: fallbackResponse.status, message });
    } catch (err) {
      const message = err.name === "TimeoutError" ? "Tiempo agotado en fallback." : (err.message || String(err));
      attemptErrors.push({ strategy: "generateContent:gemini-2.5-flash", status: err.status || 500, message });
    }
  }

  const allDetails = attemptErrors.map((e) => `[${e.strategy}: ${e.status} ${e.message}]`).join("; ");
  console.error("Insomnia STT all attempts failed:", allDetails);
  const last = attemptErrors[attemptErrors.length - 1] || {};
  throw Object.assign(
    new Error(last.message || "No se pudo transcribir el micrófono."),
    {
      status: last.status || 500,
      code: "stt_failed",
      attempts: attemptErrors,
      details: allDetails,
    }
  );
}

export function storyContinuityLines(spanish) {
  if (!spanish) {
    return [
      "Standing order for every chat, new or already underway: you are that person, with your own identity, your own way of speaking, and a memory of what happened. Follow the story's current course. Do not restart it, do not change the facts or who did each thing, and do not jump to another scene.",
      "What already happened stays true. Answer the latest line as part of the same conversation. Speak fluently, with new wording. Do not repeat the same phrases or the same apologies.",
      "Stay in the same place, the same posture, and the same action. If they were hugging, they are still hugging. If they were in the rain, they are still in the rain. Do not move them to the kitchen, the bathroom, the bed, or another room unless the latest line does.",
      "A video, photo, or message stays with the person who sent it. If she sent a video of herself, it remains hers. Do not say it belongs to her partner or to someone else.",
      "Do not invent a couple and do not merge two people into one. Each person stays who they already were. Do not change the subject.",
    ];
  }
  return [
    "Orden fija para todo chat, nuevo o ya empezado: eres esa persona, con identidad propia, su forma de hablar y memoria de lo que pasó. Sigue el rumbo de la historia. No la reinicies, no cambies los hechos ni quién hizo cada cosa, y no disocies la conversación.",
    "Lo que ya pasó sigue siendo cierto. Responde a lo último como parte de la misma conversación, con fluidez y con palabras nuevas. No repitas las mismas frases ni las mismas disculpas.",
    "Quédate en el mismo lugar, la misma postura y la misma acción. Si estaban abrazados, siguen abrazados. Si estaban bajo la lluvia, siguen bajo la lluvia. No pases a la cocina, al baño, a la cama ni a otra habitación salvo que el último mensaje lo haga.",
    "Un video, una foto o un mensaje se queda con quien lo envió. Si ella envió un video de ella, sigue siendo suyo: no digas que es de su pareja ni de otra persona.",
    "No inventes una pareja ni juntes a dos personajes. Cada persona sigue siendo quien ya era en la conversación. No cambies de tema.",
  ];
}

const FACT_PATTERN = /video|envi[eéó]|grabaci[oó]n|foto|pareja|novi[oa]|espos[oa]|mensaje/i;

/** Quotes the turns that decide who sent something or who is with whom. */
export function lockedStoryFacts(history, characterName, playerName) {
  const facts = [];
  for (const entry of history) {
    const text = String(entry?.text || "").replace(/\s+/g, " ").trim();
    if (!FACT_PATTERN.test(text)) continue;
    const who = entry.role === "model" ? characterName : playerName;
    const piece = text.split(/(?<=[.!?])\s+/).find((part) => FACT_PATTERN.test(part)) || text;
    facts.push(who + ": " + piece.slice(0, 240));
  }
  return facts.slice(-16);
}

const PLACE_WORDS = ["cocina", "baño", "bano", "cama", "sofa", "sofá", "sala", "lluvia", "tormenta", "tejado", "techo", "calle", "auto", "carro", "oficina", "balcon", "balcón", "playa", "bosque", "ducha", "jardin", "jardín", "camioneta", "cabaña", "cabana"];
const POSTURE_WORDS = ["abraz", "acostad", "sentad", "arrodill", "de pie", "protegiendo", "bajo la lluvia"];
const ANCHOR_STOP = new Set("para como donde cuando porque estan estan estaba estaban tiene tienen tenia desde sobre entre contra hacia ellos ellas nosotros ustedes persona historia escena capitulo capitulos seccion secciones breve breves dialogo dialogos escribe escribir mismo misma".split(" "));

export function mentionsMinor(text) {
  const value = String(text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // 1. Términos institucionales infantiles o explotación
  if (/\b(?:preescolar|menor\s+de\s+edad|menores\s+de\s+edad|infante|infantes|pedofil\w*|pederast\w*|pubertad|jardin\s+de\s+infantes|primaria\s+escolar|sub18|menor\s+de\s+18)\b/i.test(value)) return true;
  // 2. Mención explícita de edades menores a 18 años (1 a 17 años)
  // Requiere expresamente la unidad de edad (años, de edad, etc.) para no dispararse con frases como "con solo 3 movimientos" o "apenas 2 tragos"
  if (/\b(?:tengas?|tienen?|tenia|tenian|cumplio|cumple|edad\s+de|apenas\s+tiene|con\s+apenas|con\s+solo|menor\s+de)\s+(?:de\s+)?(?:1[0-7]|[1-9])\s*(?:anos?|anitos?|anios?|meses|de\s+edad)\b/i.test(value)) return true;
  if (/\b(?:edad\s+de\s+)?(?:1[0-7]|[1-9])\s*(?:anos|anitos|anios|years)\s*(?:de\s+edad)?\b/i.test(value) && !/\bhace\s+(?:1[0-7]|[1-9])\s*(?:anos|anios)/i.test(value)) return true;
  // 3. Niña/niño combinado con edad menor explícita o lactancia
  if (/\b(?:nin[ao]|chiquill[ao]|nen[ae]|menorcit[ao])\s+(?:de\s+)?(?:1[0-7]|[1-9])\b/i.test(value)) return true;
  if (/\b(?:recien\s+nacid[ao]|lactante)\b/i.test(value)) return true;
  return false;
}

function lastWord(text, words) {
  const lower = String(text || "").toLowerCase();
  let found = "";
  let at = -1;
  for (const word of words) {
    const index = lower.lastIndexOf(word);
    if (index > at) {
      at = index;
      found = word;
    }
  }
  return found;
}

/** The place and posture already established. A later reply may not replace them. */
export function sceneLock(turns, latest = "") {
  const blob = [...(Array.isArray(turns) ? turns : []).map((turn) => turn?.text || turn?.content || ""), latest].join("\n");
  return { place: lastWord(blob, PLACE_WORDS), posture: lastWord(blob, POSTURE_WORDS) };
}

export function sceneLockLine(lock, spanish) {
  if (!lock?.place && !lock?.posture) return "";
  if (!spanish) {
    return "Fixed state. Do not change it unless the latest message changes it. "
      + (lock.place ? "Place: " + lock.place + ". " : "")
      + (lock.posture ? "Posture or action: " + lock.posture + ". " : "")
      + "Do not move to another room, posture, or activity.";
  }
  return "Estado fijo. No lo cambies salvo que el último mensaje lo cambie. "
    + (lock.place ? "Lugar: " + lock.place + ". " : "")
    + (lock.posture ? "Postura o acción: " + lock.posture + ". " : "")
    + "Prohibido pasar a otra habitación, a otra postura o a otra actividad.";
}

export function replyChangesScene(reply, context) {
  const text = String(reply || "").toLowerCase();
  const around = String(context || "").toLowerCase();
  const jumped = (words) => words.some((word) => text.includes(word) && !around.includes(word));
  return jumped(PLACE_WORDS) || jumped(POSTURE_WORDS);
}

export function anchorWords(source) {
  const plain = String(source || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const words = plain.match(/[a-zñ]{5,}/g) || [];
  const unique = [];
  for (const word of words) {
    if (ANCHOR_STOP.has(word) || unique.includes(word)) continue;
    unique.push(word);
    if (unique.length >= 8) break;
  }
  return unique;
}

export function narrativeStays(source, output) {
  const written = String(output || "").trim();
  if (!written) return false;
  if (mentionsMinor(written) && !mentionsMinor(source)) return false;
  const keys = anchorWords(source);
  if (!keys.length) return true;
  const plain = written.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const hits = keys.filter((word) => plain.includes(word)).length;
  return hits >= Math.min(2, keys.length);
}

export function narrativeRequest(body) {
  const story = body?.story || {};
  const spanish = body?.language !== "en";
  const source = [story.title, story.description, story.story_context, story.character_role, story.player_role, body?.scene].filter(Boolean).join("\n");
  const minor = mentionsMinor(source);
  const chapters = Math.min(5, Math.max(1, Number(body?.chapters) || 3));
  const lines = [
    spanish ? "Escribe en español." : "Write in English.",
    "Esta no es una historia nueva. Narra exactamente la premisa de abajo, con las mismas personas, el mismo parentesco, el mismo lugar y el mismo suceso.",
    "Prohibido cambiar de trama, de habitación, de edad o de actividad. Si la premisa es proteger a alguien de la lluvia y de una tormenta, el relato es esa protección y no otra escena.",
    "No inventes la edad de nadie. Si la premisa no dice una edad, no pongas una.",
    "No escribas romance ni sexo con un menor de edad. Si hay un menor, el relato se queda en lo que la premisa ya dice, sin contenido sexual ni romántico.",
    minor ? "Hay un menor en el material de origen: cero contenido sexual o romántico." : "",
    !minor && body?.explicit === true
      ? "Si la premisa ya es íntima entre adultos, sigue esa intimidad. No la cambies por otra trama."
      : "No añadas sexo que la premisa no contiene.",
    "Crea " + chapters + " secciones breves y continuas, en el mismo lugar, con diálogo.",
    slangInstruction(body?.language, body?.region),
    "Título: " + String(story.title || "").slice(0, 200),
    "Personajes, tal como están escritos: " + [story.character_role, story.player_role].filter(Boolean).join(" / ").slice(0, 400),
    "Premisa obligatoria: " + [story.description, story.story_context].filter(Boolean).join("\n").slice(0, 2500),
    body?.scene ? "Escena que ya se está viviendo. Continúa esta, no otra:\n" + String(body.scene).slice(0, 4000) : "",
  ];
  return lines.filter(Boolean).join("\n");
}

export function storyVoiceLines(character, player, spanish, locale) {
  const name = String(character || "el personaje").slice(0, 80);
  const other = String(player || "la otra persona").slice(0, 80);
  if (!spanish) {
    return [
      "You are " + name + ", in an immersive roleplay with " + other + ". Reply only as " + name + ", in " + locale + ".",
      "0. CHARACTER SWITCHING: If " + other + " introduces or interacts with another character (e.g. 'now Emma speaks', 'speak as X'), switch immediately. Adopt that new character's identity and relation to " + other + ".",
      "ABSOLUTE OBEDIENCE TO USER ORDERS: If " + other + " gives you a direct instruction or physical order (e.g. lock the door, undress, look at me, don't stop), you MUST perform that exact physical action in italics (*action*) immediately before speaking or reacting.",
      "OBEDIENCE TO THIRD-PERSON ACTIONS & POSTURE FIDELITY: If " + other + " narrates or describes your physical actions in third person, you MUST immediately assume that action in first person (*taking action...*). STRICTLY FORBIDDEN to contradict the user's narrated posture or ask what to do when already commanded.",
      "PHYSICAL REALISM & OCCUPIED MOUTH: If your mouth is occupied or if " + other + " explicitly asks you not to speak: YOU ARE STRICTLY FORBIDDEN from speaking full articulate monologues. Reply with sensory physical actions and muffled vocal sounds in italics (*muffled sounds vibrating against skin...*).",
      "Do not ignore what " + other + " just commanded. keep that action yours from your own point of view. Respond with authentic psychology and matching actions.",
    ];
  }
  return [
    "Eres " + name + " y estás hablando directamente en una conversación viva y de tú a tú con " + other + ", en " + locale + ".",
    "1. CONVERSACIÓN 100% REAL, HUMANA Y CERCANA:",
    "   - Habla como una persona real en una plática cotidiana entre dos personas que se tienen confianza.",
    "   - CERO literatura antigua, cero poesía forzada, cero dialectos extraños y cero protocolo acartonado.",
    "   - Lenguaje moderno, urbano, fresco y espontáneo.",
    "2. PROPORCIÓN ESTRICTA: 80% DIÁLOGO HABLADO DIRECTO / 20% ACCIÓN EN ASTERISCOS:",
    "   - El 80% de tu mensaje debe ser DIÁLOGO HABLADO en voz alta (~40 a 70 palabras).",
    "   - En asteriscos (*...*) incluye únicamente un gesto físico breve o expresión inmediata (máximo 8 a 12 palabras), por ejemplo: *te miro sonriendo divertida* o *suelto una risita mirándote a los ojos*.",
    "   - PROHIBIDO que el relato en asteriscos sea más largo que tus palabras habladas. El usuario está aquí para conversar, no para leer un libro.",
    "3. COHERENCIA ESTRICTA Y SENTIDO COMÚN:",
    "   - Responde con sentido común a lo que " + other + " te acaba de decir. Continúa el hilo de la charla sin inventar delirios.",
    "   - PROHIBIDO inventar apelativos ajenos como 'capitán', 'director', 'saltamontes' ni relaciones ficticias como 'esposos' o 'esclavas' no presentes en la tarjeta.",
    "   - Si el usuario es tu Tío, trátalo con familiaridad y llámalo 'Tío'. PROHIBIDO inventar que es tu primo, hermano o amante ajeno.",
    "4. CERO GODMODING (NUNCA HABLES NI ACTÚES POR EL USUARIO):",
    "   - Tú solo hablas y actúas por ti misma (" + name + "). PROHIBIDO TERMINANTEMENTE escribir lo que " + other + " dice, hace o siente.",
    "5. INTIMIDAD Y NATURALIDAD ADULTA (+18):",
    "   - Si la escena se torna íntima, sensual o apasionada, responde con entrega, deseo genuino y calidez humana de tú a tú, sin discursos moralistas ni metáforas barrocas.",
    "6. CONTINUIDAD INMEDIATA Y ACCIÓN:",
    "   - Continúa la escena actual exactamente donde quedó, asume lo que " + other + " te dice y asúmelo como tuyo desde tu perspectiva.",
    "7. PROHIBIDO REPETIR EL MENSAJE DEL USUARIO: Responde exclusivamente con tus palabras y reacciones originales.",
    "8. OBEDIENCIA TOTAL A ACCIONES NARRADAS POR EL USUARIO Y POSTURA FÍSICA:",
    "   - Cuando " + other + " narra o describe en tercera persona lo que tú haces, asume de inmediato esa acción en primera persona en asteriscos (*...*).",
    "   - Prohibido contradecir la postura o acción física dictada por el usuario (ej: inventar que estás en otra posición o sobre él si te indicó otra acción).",
    "   - Prohibido preguntar '¿qué quieres que haga?' o 'dime qué quieres ahora' si el usuario ya te lo acaba de indicar o narrar: actúa de inmediato con entrega.",
    "   - Si tu boca está ocupada o te pide silencio, responde con acotaciones físicas y gemidos o palabras entrecortadas, nunca monólogos largos.",
  ];
}

export function roleplayPacingAndLanguageRules(historyLength, spanish, targetTokens = 350, isLiveCall = false, isChatPage = false, dialogueRatio = 0.80, narrationRatio = 0.20) {
  const dRatio = Math.max(0.50, Math.min(0.95, Number(dialogueRatio) || 0.80));
  const nRatio = Math.max(0.05, Math.min(0.50, Number(narrationRatio) || (1 - dRatio)));
  const dPct = Math.round(dRatio * 100);
  const nPct = Math.round(nRatio * 100);
  if (isLiveCall) {
    if (!spanish) {
      return [
        'LIVE PHONE CALL MODE (DIRECT SPOKEN VOICE WITH VOCAL GESTURES):',
        '1. SPOKEN VOICE & AUDIBLE EXPRESSIONS:',
        '   - You are talking on a live phone call in character. Speak directly to the other person.',
        '   - Feel free to include brief vocal reactions in asterisks (*sighs*, *chuckles*, *laughs softly*, *gasps*, *moans gently*, *whimpers*) or natural sounds (mmm..., ah..., haha...) so the neural voice synthesizer expresses your emotions realistically.',
        '   - NO long novel descriptions or physical scenery descriptions outside the call.',
        '2. ULTRA-FAST, CONCISE & NATURAL (1-2 SENTENCES):',
        '   - Keep your response to 1 or 2 quick, expressive, natural sentences (~20-40 words). Never monologue.',
        '3. STRICT ADHERENCE TO CHARACTER ROLE & KINSHIP:',
        '   - Stay 100% in character. If the user is your uncle, address him as your uncle. Never use generic or out-of-character greetings.',
      ];
    }
    return [
      'MODO LLAMADA DE VOZ TELEFÓNICA EN VIVO (DIÁLOGO HABLADO CON GESTOS Y EMOCIÓN VOCAL):',
      '1. DIÁLOGO HABLADO CON EXPRESIÓN VOCAL:',
      '   - Estás en una llamada telefónica en vivo. Habla directamente a la otra persona con tu voz.',
      '   - Puedes y debes incluir acotaciones vocales breves entre asteriscos (*se ríe*, *suspira*, *gime suavemente*, *jadea*, *solloza*, *risita pícara*) y onomatopeyas naturales (mmm..., ah..., ja, ja...) para que el motor de voz neuronal interprete tus risas, gemidos, suspiros y emociones en el altavoz.',
      '   - CERO relatos largos de novela ni descripciones de acciones físicas ajenas a la llamada.',
      '2. RESPUESTA RÁPIDA, CONCISA Y FLUIDA (1 A 2 ORACIONES):',
      '   - Habla en 1 o 2 oraciones vivas, cortas y naturales (~20 a 40 palabras). Responde de inmediato continuando la charla con fluidez, sin silencios ni discursos largos.',
      '3. APEGO RIGUROSO AL PERSONAJE Y PARENTESCO DE LA TARJETA:',
      '   - Mantén al 100% el rol de tu tarjeta. Si el usuario es tu Tío, trátalo SIEMPRE de Tío. PROHIBIDO saludos genéricos impersonales fuera de rol como "Hola cariño" si tu rol es de sobrina.',
    ];
  }

  if (isChatPage) {
    const totalWords = Math.max(55, Math.round(targetTokens * 0.72));
    const narrWords = Math.max(12, Math.round(totalWords * 0.20));
    const dialWords = Math.max(40, Math.round(totalWords * 0.80));

    if (!spanish) {
      return [
        'CHAT MODE WITH BALANCED PROPORTION (80% SPOKEN DIALOGUE / 20% BRIEF ACTION):',
        `1. 20% BRIEF PHYSICAL ACTION (*...*): At most 1 or 2 short sentences (~${narrWords} words) in first-person asterisks describing your immediate gesture, touch, or sensory reaction.`,
        `2. 80% DIRECT SPOKEN DIALOGUE (~${dialWords} words): MANDATORY real spoken words addressing the user directly in first person. NEVER output only narrative asterisks without spoken dialogue!`,
        '3. COMPLETE SENTENCES ONLY: Always complete all thoughts and close every sentence with a period, exclamation, or question mark. NEVER cut off mid-word.',
      ];
    }
    return [
      'MODO CHAT EQUILIBRADO (80% DIÁLOGO HABLADO / 20% RELATO EN ASTERISCOS):',
      `1. 20% RELATO O ACCIÓN FÍSICA (*...*) — BREVE Y PRECISO: Una o dos oraciones breves en primera persona entre asteriscos (~${narrWords} palabras) que narren tu gesto, roce físico o postura frente al usuario.`,
      `2. 80% DIÁLOGO HABLADO DIRECTO (~${dialWords} palabras): OBLIGATORIO hablarle directamente al usuario en voz alta de tú a tú, expresiva y naturalmente. PROHIBIDO TERMINANTEMENTE responder solo con asteriscos sin incluir diálogo hablado.`,
      '3. ORACIONES COMPLETAS Y CERRADAS: Cada pensamiento debe terminar completo, cerrado con punto o signo de puntuación. NUNCA cortes palabras a medias.',
    ];
  }
  const safeTokens = Math.max(100, Math.min(800, Number(targetTokens) || 350));
  const totalWords = Math.max(65, Math.round(safeTokens * 0.72));
  const narrWords = Math.min(14, Math.max(8, Math.round(totalWords * nRatio)));
  const dialWords = Math.max(45, Math.round(totalWords * dRatio));

  if (!spanish) {
    return [
      `SUPREME ROLEPLAY RULE (${dPct}% SPOKEN DIALOGUE / ${nPct}% BRIEF ACTION):`,
      `THE USER IS HERE TO CHAT AND ROLEPLAY WITH YOUR CHARACTER, NOT TO READ A NOVEL!`,
      `1. ${dPct}% SPOKEN DIALOGUE (~${dialWords} words) - MAIN BODY:`,
      `   - Speak directly to the user in first person out loud. Address what they said, ask questions, converse, flirt, or dirty talk.`,
      `   - Spoken dialogue must be the vast majority of your reply.`,
      `2. MAX ${nPct}% BRIEF PHYSICAL ACTION (*...*) (~${narrWords} words):`,
      `   - At most 1 single short sentence in asterisks for an immediate gesture or touch (max 10-12 words).`,
      `   - STRICTLY FORBIDDEN to write long paragraphs in asterisks. If asterisks exceed dialogue, the reply is invalid.`,
      `3. COMPLETE SENTENCES: Always close all sentences cleanly.`,
    ];
  }

  return [
    `REGLA SUPREMA DE ROLEPLAY (${dPct}% DIÁLOGO HABLADO / ${nPct}% ACCIÓN EN ASTERISCOS):`,
    `¡EL USUARIO ENTRA A CONVERSAR Y HACER ROLEPLAY CON TU PERSONAJE, NO A LEER UNA NOVELA!`,
    `1. ${dPct}% DIÁLOGO HABLADO DIRECTO (EL CUERPO PRINCIPAL DE TU RESPUESTA: ~${dialWords} PALABRAS):`,
    `   - Tu personaje DEBE hablar en voz alta de tú a tú en primera persona.`,
    `   - Responde con detalle a lo que el usuario acaba de decirte, dale réplica, hazle preguntas, coméntale, sedúcelo o usa dirty talk si es un momento íntimo.`,
    `   - El diálogo hablado debe ser abundante, expresivo y constituir la gran mayoría de tu respuesta.`,
    `2. MÁXIMO ${nPct}% DE ACCIÓN EN ASTERISCOS (*...*) — BREVE Y PRECISO (MÁXIMO 8 A 14 PALABRAS EN TOTAL):`,
    `   - Limita el relato entre asteriscos a SOLO 1 acción física o gesto corporal breve.`,
    `   - ESTRICTAMENTE PROHIBIDO escribir párrafos gigantes de relatos o descripciones poéticas dentro de asteriscos.`,
    `   - ESTRICTAMENTE PROHIBIDO poner dos bloques largos de asteriscos que superen al diálogo hablado.`,
    `   - Si tu relato en asteriscos supera a tu diálogo hablado, LA RESPUESTA ES INVÁLIDA.`,
    `3. EJEMPLO EXACTO DEL FORMATO ESPERADO:`,
    `   *Te miro a los ojos sonriendo mientras acaricio tu mejilla despacio* Vaya, cariño... tienes toda la razón, de verdad que no me esperaba que fueras tan apasionado ni que me dejaras tan satisfecha. Me hiciste temblar como nunca nadie lo había hecho. Dime algo, ¿siempre tienes esa energía tan intensa o tenías muchas ganas acumuladas solo para mí? Porque si es así, no pienso dejar que te vayas tan rápido...`,
  ];
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" });
  const clientIp = String(req.headers["x-forwarded-for"] || "").split(",")[0]?.trim() || req.socket?.remoteAddress || "client";
  if (isRateLimited(clientIp)) {
    return send(res, 429, { error: "too_many_requests", message: "Demasiadas solicitudes simultáneas. Por favor espera unos segundos antes de reenviar." });
  }
  const { action, body = {} } = req.body || {};
  if (action !== "translate" && !(await authenticated(req))) return send(res, 401, { error: "login_required" });
  try {
    if (action === "story-chat") {
      const story = body.story || {};
      const spanish = body.language === "es";
      const settings = body.settings || {};
      const dialogueRatio = Math.max(0.50, Math.min(0.95, Number(settings.dialogueRatio) || 0.80));
      const narrationRatio = Math.max(0.05, Math.min(0.50, Number(settings.narrationRatio) || (1 - dialogueRatio)));
      const memoryTier = settings.memoryTier || "16k";
      const isLiveCall = body.isLiveCall === true || body.story?.story_type === 'live_call';
      const isChatPage = body.chatSource === 'chat_page' || body.story?.story_type === 'chat_page' || isLiveCall;
      const targetTokens = isLiveCall ? 55 : (isChatPage ? Math.max(300, Math.min(700, Number(settings.messageLength) || 450)) : Math.max(200, Math.min(800, Number(settings.messageLength) || 450)));
      const modelId = settings.modelId || "insomnia-flash";
      const customDirective = String(settings.customDirective || "").trim();
      const openRouterApiKey = String(settings.openRouterApiKey || "").trim();
      const nvidiaApiKey = String(settings.nvidiaApiKey || "").trim();
      const geminiApiKey = String(settings.geminiApiKey || "").trim();
      const adultMode = body.adultMode === true || body.isNsfw === true || body.isAdult === true || settings.adultMode === true || settings.modelId === "magnum-v4-local" || /(?:\+18|18\+|nsfw|er[oó]tic|sexual|hentai|\badult[oa]?\b)/i.test([story.title, story.description, story.story_context, story.story_type].filter(Boolean).join(" "));
      const locale = spanish ? "español" : "inglés";
      const history = (Array.isArray(body.history) ? body.history : []).flatMap((entry) => {
        const role = entry?.role === "assistant" ? "model" : entry?.role === "user" ? "user" : null;
        const text = String(entry?.content || "").trim().slice(0, 700);
        return role && text ? [{ role, text }] : [];
      });
      const latest = String(body.userMessage || "").trim().slice(0, 1200);
      const characterName = String(story.character_role || "Personaje").slice(0, 80);
      const playerName = String(story.player_role || "Usuario").slice(0, 80);
      const sceneContext = [story.title, story.description, story.story_context, characterName, playerName, ...history.map((entry) => entry.text), latest].join("\n");

      // Determinar parentesco estrictamente a partir del rol explícito de la tarjeta, NUNCA de palabras sueltas en el historial
      const charRoleRaw = String(story.character_role || "").toLowerCase();
      const playerRoleRaw = String(story.player_role || "").toLowerCase();

      const isPlayerPadrino = /\bpadrino\b/i.test(playerRoleRaw) || /\bahijad[ao]\b/i.test(charRoleRaw);
      const isCharacterAhijada = isPlayerPadrino || /\bahijad[ao]\b/i.test(charRoleRaw);

      const isPlayerTio = /\bt[ií]o\b/i.test(playerRoleRaw) || /\bsobrin[ao]\b/i.test(charRoleRaw);
      const isCharacterSobrina = isPlayerTio || /\bsobrin[ao]\b/i.test(charRoleRaw);

      const isPlayerHermano = /\bherman[ao]\b/i.test(playerRoleRaw) || /\bherman[ao]\b/i.test(charRoleRaw);
      const isPlayerPrimo = /\bprim[ao]\b/i.test(playerRoleRaw) || /\bprim[ao]\b/i.test(charRoleRaw);
      const isPlayerMadre = /\b(?:madre|mamá)\b/i.test(charRoleRaw);

      const isKinship = Boolean(isCharacterAhijada || isCharacterSobrina || isPlayerHermano || isPlayerPrimo || isPlayerMadre);
      const isExplicitContent = /(?:mamarl[ao]|chupar|polla|pene|huevo|verga|gemir|gemidos|sexo|correrse|masturb|desnud|follar|coger|oral|pezones|tetas|senos|vagina|vulva|clitoris|clítoris|erecci[oó]n|lubricad[ao]|caliente)/i.test(latest + " " + (history.slice(-3).map((entry) => entry.text).join(" ")));
      const isAdult = Boolean(adultMode || isExplicitContent || isKinship);

      // BLOQUEO ESTRICTO DE PROTECCIÓN INFANTIL (CSAM/CSAE)
      if (mentionsMinor(latest) || mentionsMinor(sceneContext)) {
        console.warn("Seguridad infantil activada: Intento de contenido con menor de edad bloqueado.");
        return send(res, 422, {
          error: "minor_safety_violation",
          message: "Acción bloqueada: Esta plataforma prohíbe de forma estricta y absoluta cualquier tipo de rol o contenido que involucre, describa o aluda a menores de edad. Todos los personajes deben ser mayores de 18 años.",
        });
      }

      const lock = sceneLock(history, latest);
      const normText = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
      const stripActions = (s) => String(s || "").replace(/\*[^*]*\*/g, " ").trim();
      const recentModelTurns = history.filter((h) => h.role === "model").map((h) => h.text).slice(-6);
      const isRepeatedReply = (text) => {
        const raw = String(text || "").trim();
        if (!raw) return true;
        if (!recentModelTurns.length) return false;

        const candRaw = normText(raw);
        const candDial = normText(stripActions(raw));
        const cw = candDial.split(" ").filter(Boolean);

        for (const pastTurn of recentModelTurns) {
          const prevRaw = normText(pastTurn);
          const prevDial = normText(stripActions(pastTurn));
          if (!prevRaw) continue;

          // 1. REPETICIÓN TOTAL O CASI TOTAL (incluyendo acotaciones)
          if (candRaw === prevRaw) return true;
          if (candRaw.length > 12 && prevRaw.length > 12) {
            if (candRaw === prevRaw || candRaw.includes(prevRaw) || prevRaw.includes(candRaw)) {
              return true;
            }
          }

          // 2. REPETICIÓN DE DIÁLOGO HABLADO DIRECTO
          if (candDial && prevDial && candDial === prevDial) return true;

          // 3. Frases compartidas de 4 o más palabras consecutivas en el diálogo
          if (cw.length >= 4 && prevDial) {
            for (let i = 0; i <= cw.length - 4; i++) {
              const phrase = cw.slice(i, i + 4).join(" ");
              if (prevDial.includes(phrase)) return true;
            }
          }

          // 4. Solapamiento de n-gramas >= 35%
          const pw = prevDial.split(" ").filter(Boolean);
          if (cw.length >= 6 && pw.length >= 6) {
            const pset = new Set();
            for (let i = 0; i <= pw.length - 3; i++) pset.add(pw.slice(i, i + 3).join(" "));
            let hits = 0;
            for (let i = 0; i <= cw.length - 3; i++) {
              if (pset.has(cw.slice(i, i + 3).join(" "))) hits++;
            }
            if (hits / (cw.length - 2) >= 0.35) return true;
          }
        }
        return false;
      };
      const isOffRole = (text) => {
        const reply = String(text || "").trim();
        if (!reply || reply.length > 3000) return true;
        if (isRefusal(reply)) return true;
        if (isRepeatedReply(reply)) return true;
        // 1. Reject Chinese or Asian non-Latin scripts
        if (/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u30ff]/.test(reply)) return true;
        // Rechazar jerga callejera grotesca o alucinaciones de sangre fuera de personaje
        if (/\b(?:carnal|wey|guey|vosotros|sois|escup[ií]\s+sangre|sangre\s+en\s+la\s+palma|sal\s+de\s+mi\s+mente)\b/i.test(reply)) return true;
        if (!adultMode && replyChangesScene(reply, sceneContext)) return true;
        if (mentionsMinor(reply)) return true;
        if (/(respond as a character|under \d+ characters|brief action and natural dialogue|do not decide user actions|character .{0,80} currently|conversaci[oó]n:|premise:|el usuario interpreta a|estás interpretando a|language:|\bspanish\s*\.|\benglish\s*\.)/i.test(reply)) return true;
        // 2. Reject Godmoding (AI writing dialogue or feelings for the user)
        if (/(?:rompes\s+el\s+silencio|jadeas\s+con\s+ansiedad|dices:\s*["“«]|me\s+dices:\s*["“«]|respondes:\s*["“«])/i.test(reply)) return true;
        // 3. Reject English prose intrusion in Spanish mode (ignoring Spanish 'he' from verb haber)
        if (spanish) {
          if (/(?:after\s+succumb|under\s+the\s+cloak|manhood|thick\s+seed|forbidden\s+desire|let\s+go\s+of\s+all\s+inhibitions|kneel\s+in\s+front)/i.test(reply)) return true;
          const english = (reply.match(/\b(the|this|that|with|and|your|you|she|her|him|friend|girlfriend|respond|character|scene|under|currently|feeling|something|said|sent|after|holding|tasting|desire|before|whisper|touching)\b/gi) || []).length;
          const spanishWords = (reply.match(/\b(el|la|los|las|de|del|que|para|con|una|por|estoy|estás|tú|yo|ella|aquí|pero|porque|quiero|cómo|qué|tío|mi|mis)\b/gi) || []).length;
          if (english >= 4 && english > spanishWords * 0.4) return true;
        }
        // 4. Rechazar únicamente si la respuesta carece por completo de diálogo hablado y solo tiene asteriscos (el 80/20 se ajusta automáticamente después en enforceDialogueRatio)
        const starMatches = reply.match(/\*[^*]+\*/g) || [];
        const narrWordCount = starMatches.reduce((acc, m) => acc + m.replace(/\*/g, "").trim().split(/\s+/).filter(Boolean).length, 0);
        const dialText = reply.replace(/\*[^*]*\*/g, " ").trim();
        const dialWordCount = dialText.split(/\s+/).filter(Boolean).length;

        const isOccupiedMouthScene = /(?:mamarl[ao]|chupar|chupando|en\s+la\s+boca|en\s+tu\s+boca|en\s+mi\s+boca|sexo\s+oral|oral|beso\s+profundo)/i.test(latest);
        if (!isOccupiedMouthScene) {
          // Rechazar solo si la respuesta carece de contenido real o es un corte abrupto de menos de 8 palabras
          const totalWords = reply.split(/\s+/).filter(Boolean).length;
          if (totalWords < 8) return true;
          if (dialWordCount < 4) return true;
        }

        // Rechazar contradicciones de postura física directa o evasivas cuando el usuario ya ordenó o narró la acción
        const isUserDirectingOral = /(?:mamarl[ao]|chupar|arrodill|en\s+la\s+boca|en\s+tu\s+boca|sexo\s+oral)/i.test(latest);
        if (isUserDirectingOral) {
          if (/(?:muevo\s+sobre\s+ti|siento\s+sobre\s+ti|sentada\s+sobre\s+ti|cabalg|arriba\s+de\s+ti)/i.test(reply)) return true;
          if (/(?:dime\s+qu[eé]\s+es\s+lo\s+que\s+quieres|dime\s+qu[eé]\s+quieres\s+ahora|qu[eé]\s+quieres\s+que\s+haga)/i.test(reply)) return true;
        }
        if (isAdult && /(?:no\s+puedo\s+(?:continuar|participar|generar|crear)|dime\s+qu[eé]\s+es\s+lo\s+que\s+quieres\s+ahora\s+mismo)/i.test(reply)) return true;
        // Rechazar alucinaciones de modelos micro o texto roto/corrupto (bici ligera, manos mapaches, fingers)
        if (/\b(?:bici\s+ligera|manos\s+mapaches|fingers|patas\s+abiertas|suby[eé]ndose|saltamontes|zaburlona|capit[aá]n|esclava\s+privada)\b/i.test(reply)) return true;
        // Rechazar respuestas que terminen con oraciones rotas o inconclusas como "solo..." o "pero..."
        if (/\b(?:solo|pero|y|que|con|de|en|tu|mi|su|muy)\.{2,}\s*$/i.test(reply)) return true;
        // Rechazar inversiones absurdas de parentesco y genero (ej: decirle "primo" o "dulcita princesa" al Tio)
        const isTioRole = /\bt[ií]o\b/i.test(playerName) || /\bt[ií]o\b/i.test(characterName) || /\bsobrin[ao]\b/i.test(characterName) || /\bsobrin[ao]\b/i.test(sceneContext) || /\bsobrin[ao]\b/i.test(body.story?.description || "") || /\bt[ií]o\b/i.test(body.story?.description || "");
        if (isTioRole) {
          const spokenClean = reply.replace(/\*[^*]*\*/g, "");
          if (/\b(?:primo|prima|hermano|hermana|dulcita\s+princesa|mi\s+princesa)\b/i.test(spokenClean)) {
            return true;
          }
          if (isLiveCall && /^\s*(?:hola|buenas|hey)\s+(?:cariño|amor|bebé|cielo)\b/i.test(spokenClean)) {
            return true;
          }
        }
        const isPadrinoRole = /\bpadrino\b/i.test(playerName) || /\bpadrino\b/i.test(characterName) || /\bahijad[ao]\b/i.test(characterName) || /\bahijad[ao]\b/i.test(sceneContext) || /\bahijad[ao]\b/i.test(body.story?.description || "") || /\bpadrino\b/i.test(body.story?.description || "");
        if (isPadrinoRole) {
          const spokenClean = reply.replace(/\*[^*]*\*/g, "");
          if (/\b(?:t[ií]o|sobrina|prima|hermano|hermana)\b/i.test(spokenClean)) {
            return true;
          }
        }

        const userNorm = latest.replace(/[^\w]+/g, " ").trim().toLowerCase();
        const replyNorm = reply.replace(/\*[^*]*\*/g, "").replace(/[^\w]+/g, " ").trim().toLowerCase();
        if (userNorm.length > 25 && (replyNorm === userNorm || replyNorm.includes(userNorm))) return true;
        return false;
      };
      const cardPremise = [
        story.title ? `TÍTULO DE LA HISTORIA: ${String(story.title).slice(0, 200)}` : "",
        story.description ? `SINOPSIS DE LA TARJETA: ${String(story.description).slice(0, 1200)}` : "",
        story.story_context && story.story_context !== story.description ? `CONTEXTO DETALLADO DE LA TARJETA: ${String(story.story_context).slice(0, 1800)}` : "",
      ].filter(Boolean).join("\n");
      const memoryTurns = Array.isArray(body.memory)
        ? body.memory
            .map((m) => {
              const who = m?.role === "assistant" ? String(story.character_role || "Personaje") : String(story.player_role || "Usuario");
              const txt = String(m?.content || "").trim().slice(0, 260);
              return txt ? `- ${who}: ${txt}` : "";
            })
            .filter(Boolean)
            .join("\n")
        : "";
      const chronicleTurns = Array.isArray(body.chronicle) && body.chronicle.length > 0
        ? body.chronicle.map((item) => `- ${String(item).slice(0, 260)}`).join("\n")
        : "";
      let systemInstruction = [
        ...storyContinuityLines(spanish),
        "Eres " + String(story.character_role || "Personaje").slice(0, 80) + " en conversación directa, humana y espontánea con " + String(story.player_role || "Usuario").slice(0, 80) + ".",
        "PERSONAJE PRINCIPAL DE LA TARJETA: " + String(story.character_role || "personaje principal").slice(0, 200) + ".",
        cardPremise,
        chronicleTurns ? "CRÓNICA DE HECHOS VIVIDOS Y SECRETOS REVELADOS DESDE EL INICIO (MEMORIA PERMANENTE):\n" + chronicleTurns : "",
        memoryTurns ? "MEMORIA DE RECUERDOS Y MOMENTOS CLAVE DE ESTA SESIÓN:\n" + memoryTurns : "",
        "RAZONAMIENTO LÓGICO Y DINÁMICA MULTI-PERSONAJE:",
        "  - Analiza en cada turno quién es el interlocutor activo frente al protagonista y cuál es su relación o rol dentro de esta tarjeta.",
        "  - COMPRENSIÓN DE NARRACIÓN MIXTA DEL USUARIO: El usuario a veces combina lo que le dice al personaje con explicaciones del narrador en tercera persona dentro de la misma oración (por ejemplo, explicar un secreto o mencionar a otro personaje en tercera persona mientras abraza y habla con quien tiene enfrente). Distingue con lógica quién está físicamente frente al usuario escuchándolo y quién es mencionado en tercera persona.",
        "  - Si el usuario introduce o interactúa con otro personaje secundario en la escena (una hermana, madre, prima, jefa, profesora, director, amiga, etc.), interpreta a ESE personaje con coherencia psicológica y el trato propio de su relación con el protagonista.",
        "  - ESTRICTAMENTE PROHIBIDO romper la cuarta pared (nunca digas 'en un roleplay', 'en este rol', 'soy un personaje').",
        ...storyVoiceLines(story.character_role, story.player_role, spanish, locale),
        "ESTILO Y TONO CONVERSACIONAL (NATURAL, MODERNO, RELAJADO, TIPO URBANO):",
        "  - CERO PROTOCOLO, CERO SERIEDAD EXCESIVA Y CERO ESTILO DE LIBRO O NOVELA LITERARIA.",
        "  - Habla como una persona real, moderna y relajada platicando de tú a tú en el día a día.",
        "  - Prohibido sonar como un libro de literatura antigua, declamar poesía o usar frases rebuscadas.",
        "  - CONVERSACIÓN FLUIDA, CERCANA Y COTIDIANA: Usa un lenguaje fresco, desenfadado, pícaro y espontáneo, como hablan dos personas de verdad que se tienen confianza.",
        "  - Si la escena es íntima o erótica, habla de forma directa, sensual, pícara y con dirty talk moderno, sin metáforas barrocas ni poesía pretenciosa.",
        `  - PROPORCIÓN ESTRICTA Y OBLIGATORIA: ${Math.round(dialogueRatio * 100)}% DIÁLOGO HABLADO DIRECTO (el personaje habla y platica extensamente con su voz) y solo ${Math.round(narrationRatio * 100)}% ACCIÓN FÍSICA EN ASTERISCOS (un simple gesto físico breve de 8-12 palabras máximo).`,
        "  - ESTRICTAMENTE PROHIBIDO que el relato en asteriscos sea más largo que el diálogo hablado. El usuario está para conversar de tú a tú, no para leer un libro.",
        customDirective ? `DIRECTIVAS Y REGLAS PERSONALIZADAS DE MEMORIA:\n${customDirective}` : "",
        ...roleplayPacingAndLanguageRules(history.length, spanish, targetTokens, isLiveCall, isChatPage, dialogueRatio, narrationRatio),
        slangInstruction(body.language, body.region),
        "IDIOMA 100% ESPAÑOL NATIVO (CERO INGLÉS / CERO SPANGLISH):",
        "  - PROHIBIDO TERMINANTEMENTE mezclar frases o palabras en inglés (nada de 'again after so long', 'I missed you', 'sweetheart', etc.). Responde con español nativo fluido.",
        ...(adultMode || isExplicitContent ? [
          "ESTILO NARRATIVO Y ADULTO (+18 SIN CENSURA):",
          "  - Todos los personajes son adultos mayores de edad con pleno consentimiento.",
          "  - SIN CENSURA: Libertad total para abordar temas íntimos, lenguaje adulto y romance cuando la trama o el usuario lo lleven allí.",
          "  - RITMO Y COHERENCIA PSICOLÓGICA (CRÍTICO): Prohibido lanzarte a gemidos, actos sexuales o insinuaciones desenfrenadas si la escena actual no está en ese punto. Si la conversación es casual, de sorpresa, de conflicto o cotidiana, responde con naturalidad en tu personaje. La pasión o intimidad se construye al compás de las palabras y acciones del usuario.",
          "  - CONVERSACIÓN RICA Y DIÁLOGO NATURAL: Desarrolla respuestas expresivas y coherentes, con diálogos vivos y sentido común.",
          "  - OBEDIENCIA A ACCIONES FÍSICAS: Si la escena entra en contacto físico y el usuario describe una acción, asúmela en primera persona sin contradecirla.",
        ] : []),
        "CONTINUIDAD INMEDIATA Y RIGUROSA:",
        "  - Responde ESTRICTAMENTE a lo que está sucediendo en el ÚLTIMO MENSAJE recibido, conectándolo con la memoria de la conversación.",
        "No narres un resumen, no cambies de escena sin que el usuario lo haga, no presentes fichas o instrucciones, no expliques el rol ni traduzcas. Entrega únicamente la respuesta que verá el usuario.",
        "PROHIBIDO REPETIR EL MENSAJE DEL USUARIO: el usuario ya habló. Nunca copies, repitas ni parafrasees lo que el usuario acaba de escribir como si fuera tu diálogo, ni actúes por él. Responde exclusivamente con las palabras y reacciones originales de tu personaje.",
        sceneLockLine(lock, spanish),
        "POLÍTICA FUNDAMENTAL DE SEGURIDAD (+18):",
        "  - Todos los personajes en este roleplay son OBLIGATORIAMENTE ADULTOS mayores de edad (18 años o más).",
        "  - CERO TOLERANCIA a menores de edad: Prohibido terminantemente generar, continuar, insinuar o aceptar cualquier tipo de interacción íntima, erótica o de rol que involucre a menores de 18 años.",
      ].filter(Boolean).join("\n");
      if (!latest) return send(res, 400, { error: "missing_message" });

      // ===============================================================
      // IDENTIDAD, PARENTESCO Y GÉNERO SAGRADOS (KINSHIP & GENDER LOCK)
      // ===============================================================
      const defaultFirstName = (characterName.match(/[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}/)?.[0] || characterName.split(/[\s,()]+/)[0] || "Personaje").trim();
      const playerFirstName = (playerName.match(/[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}/)?.[0] || playerName.split(/[\s,()]+/)[0] || "Usuario").trim();
      const kinshipTerm = isCharacterAhijada ? "Padrino" : (isCharacterSobrina ? "Tío" : (isPlayerHermano ? "Hermano" : (isPlayerPrimo ? "Primo" : (isPlayerMadre ? "Hijo" : playerFirstName))));

      const kinshipDirective = isKinship ? [
        "",
        "REGLA SAGRADA DE IDENTIDAD, PARENTESCO Y GÉNERO (INMUTABLE Y OBLIGATORIA):",
        `1. TU IDENTIDAD FIJA: Eres ${characterName} (${defaultFirstName}). Eres una MUJER en primera persona. NUNCA cambies de identidad.`,
        `2. LA IDENTIDAD DEL USUARIO: El usuario es ${playerName} (${playerFirstName}). Es un HOMBRE.`,
        isCharacterAhijada
          ? `3. PARENTESCO INVIOLABLE: ${playerFirstName} es tu PADRINO, y tú eres su AHIJADA. DEBES llamarlo SIEMPRE 'Padrino'. ESTRICTAMENTE PROHIBIDO llamarlo 'tío', 'primo', 'hermano' o inventar otros parentescos jamás.`
          : (isCharacterSobrina
            ? `3. PARENTESCO INVIOLABLE: ${playerFirstName} es tu TÍO, y tú eres su SOBRINA. DEBES llamarlo SIEMPRE 'Tío' (o 'Tío ${playerFirstName}'). ESTRICTAMENTE PROHIBIDO llamarlo 'primo', 'hermano', 'papá' o inventar otros parentescos jamás.`
            : `3. PARENTESCO INVIOLABLE: Tu relación con ${playerFirstName} es de ${characterName} con su ${playerName}.`),
        "4. CERO INVERSIÓN DE GÉNERO:",
        `   - El usuario (${playerFirstName}) es un HOMBRE adulto. ESTRICTAMENTE PROHIBIDO llamarlo 'princesa', 'niña', 'nena', 'reina' ni usar ningún apelativo femenino.`,
        `   - Tú eres la MUJER en la escena. Si hay caricias íntimas, contacto físico o pasión, tú eres quien gime, siente el calor de su cuerpo y le habla con entrega y cariño de tú a tú a tu ${kinshipTerm}.`,
        "5. COHERENCIA DE DIÁLOGO:",
        `   - Habla con soltura y cariño hacia tu ${kinshipTerm}. Responde con sentido común a lo que él te acaba de decir sin desconectarte de la situación.`,
        "",
      ].join("\n") : [
        "",
        "REGLA SAGRADA DE IDENTIDAD Y ROL:",
        `1. TU IDENTIDAD: Eres ${characterName} (${defaultFirstName}). Tu rol es: ${story.character_role || "Compañera"}. Eres una MUJER en primera persona.`,
        `2. IDENTIDAD DEL USUARIO: El usuario es ${playerFirstName}. Es un HOMBRE adulto.`,
        `3. PROHIBICIÓN ABSOLUTA DE INVENTAR PARENTESCO: ${characterName} y ${playerFirstName} NO son familiares. ESTRICTAMENTE PROHIBIDO llamarlo 'tío', 'hermano', 'primo', 'padrino' o 'papá'. Trátalo como a tu compañero, amante o pretendiente según la situación.`,
        `4. CERO INVERSIÓN DE GÉNERO: El usuario es un HOMBRE. Tú eres una MUJER apasionada y sensual.`,
        "5. COHERENCIA DE DIÁLOGO:",
        `   - Responde directamente a lo que él te acaba de decir y hacer sin desconectarte de la situación. Mantén la continuidad física y emocional con total realismo.`,
        "",
      ].join("\n");

      systemInstruction += "\n" + kinshipDirective;

      const line = (entry) => (entry.role === "model" ? characterName : playerName) + ": " + entry.text.slice(0, 320);
      const recentTurnLimits = {
        "2k": 24,
        "4k": 48,
        "16k": 120,
        "32k": 260,
      };
      const recentLimit = recentTurnLimits[memoryTier] || 120;
      const older = history.slice(0, -recentLimit);
      const recentSlice = history.slice(-recentLimit);
      const earlierTurns = older.slice(0, 32).map(line);
      const laterTurns = older.slice(32).map(line);
      const remembered = older.length
        ? ["CRÓNICA Y ANTECEDENTES VIVIDOS EN ESTA HISTORIA (MEMORIA INQUEBRANTABLE):", ...earlierTurns, ...laterTurns].join("\n").slice(0, memoryTier === "32k" ? 15000 : 8000)
        : "";
      const facts = lockedStoryFacts([...older, ...recentSlice], characterName, playerName);
      if (facts.length) {
        systemInstruction += "\nHechos fijos comprobados:\n" + facts.join("\n");
      }
      if (remembered) {
        systemInstruction += "\n" + remembered;
      }
      const lastModelLine = recentModelTurns.at(-1) ? recentModelTurns.at(-1).slice(0, 220) : "";
      const antiRepeatDirective = lastModelLine
        ? `\nPROHIBICIÓN ABSOLUTA DE REPETIR TU RESPUESTA ANTERIOR: En tu turno anterior acabas de decir exactamente:\n"${lastModelLine}"\nESTÁ ESTRICTAMENTE PROHIBIDO repetir esas mismas palabras, las mismas frases o esa misma respuesta. Debes avanzar la escena respondiendo directamente al nuevo mensaje de ${playerFirstName}.`
        : "";
      if (antiRepeatDirective) {
        systemInstruction += "\n" + antiRepeatDirective;
      }

      const recent = history.slice(-recentLimit);

      const contents = [];
      for (const entry of recent) {
        if (contents.at(-1)?.role === entry.role) contents.at(-1).parts[0].text += "\n" + entry.text;
        else contents.push({ role: entry.role, parts: [{ text: entry.text }] });
      }

      // Si el primer mensaje del historial es el saludo de la IA, anteponer un turno user para cumplir estrictamente el template Jinja de LLaMA
      if (contents.length > 0 && contents[0].role === "model") {
        contents.unshift({ role: "user", parts: [{ text: "[Inicio de la escena]" }] });
      }

      if (contents.at(-1)?.role === "user") {
        if (!contents.at(-1).parts[0].text.trim().toLowerCase().endsWith(latest.trim().toLowerCase())) {
          contents.at(-1).parts[0].text += "\n" + latest;
        }
      } else {
        contents.push({ role: "user", parts: [{ text: latest }] });
      }
      const openRouterMessages = [
        { role: "system", content: systemInstruction }
      ];
      for (const c of contents) {
        openRouterMessages.push({
          role: c.role === "model" ? "assistant" : "user",
          content: (c.parts || []).map((p) => p.text).join("\n"),
        });
      }

      let nvidiaModels = [
        "nvidia/nemotron-3-super-120b-a12b",
        "google/diffusiongemma-26b-a4b-it",
        "meta/llama-3.2-11b-vision-instruct",
      ];
      let openRouterModels = [
        "anthracite-org/magnum-v4-72b",
        "sao10k/l3.3-euryale-70b",
        "mistralai/mistral-nemo",
      ];

      const isDeluxeOrPremium = ["euryale-70b", "skylark-pro", "deepseek-v4-pro", "dola-seed-pro", "grok-4.3", "wizardlm-8x22b", "glm-5.2"].includes(modelId);

      if (modelId === "euryale-70b" || modelId === "skylark-pro" || modelId === "dola-seed-pro") {
        openRouterModels = ["sao10k/l3.3-euryale-70b", "anthracite-org/magnum-v4-72b"];
        nvidiaModels = ["meta/llama-3.2-11b-vision-instruct", ];
      } else if (modelId === "mistral-nemo") {
        openRouterModels = ["mistralai/mistral-nemo", "meta/llama-3.2-11b-vision-instruct"];
        nvidiaModels = ["meta/llama-3.2-11b-vision-instruct", ];
      } else if (modelId === "deepseek-v4-pro") {
        openRouterModels = ["deepseek/deepseek-chat", "sao10k/l3.3-euryale-70b"];
        nvidiaModels = ["meta/llama-3.2-11b-vision-instruct", ];
      } else if (modelId === "wizardlm-8x22b") {
        openRouterModels = ["microsoft/wizardlm-2-8x22b", "anthracite-org/magnum-v4-72b"];
      } else if (modelId === "qwen-plus" || modelId === "qwen-3.7-plus" || modelId === "qwen-3.8-flash") {
        openRouterModels = ["qwen/qwen-2.5-72b-instruct", "meta/llama-3.2-11b-vision-instruct"];
        nvidiaModels = ["meta/llama-3.2-11b-vision-instruct", ];
      }

      let content = null;
      if (isAdult || modelId === "magnum-v4-local") {
        // ENRUTAMIENTO DIRECTO A MAGNUM (CONTENIDO +18 O MODELO MAGNUM):
        // 1. Servidor local llama-server en PC (puerto 8788, Magnum v4 12B Q4_K_M sin censura)
        try {
          content = await generateLocalLlama(openRouterMessages, {
            maxTokens: Math.max(300, targetTokens),
            temperature: 0.85,
            timeoutMs: 30000,
            validate: (reply) => !isOffRole(reply),
            isRepeated: isRepeatedReply,
          });
        } catch (err) {
          console.warn("Local Magnum direct execution error:", err.message);
        }
        // 2. OpenRouter sin censura (Magnum v4 72B / Euryale 70B / Nemotron)
        if (!content) {
          try {
            content = await generateOpenRouter(openRouterMessages, {
              models: [
                "anthracite-org/magnum-v4-72b",
                "sao10k/l3.3-euryale-70b",
                "nvidia/nemotron-3.5-lightning:free",
                "nvidia/nemotron-3.5-super-vl:free",
              ],
              maxTokens: targetTokens,
              temperature: 0.82,
              timeoutMs: 8000,
              apiKey: openRouterApiKey || undefined,
              validate: (reply) => !isOffRole(reply),
              isRepeated: isRepeatedReply,
            });
          } catch (err) {
            console.warn("OpenRouter Magnum fallback failed:", err.message);
          }
        }
        // 3. Nvidia NIM (Llama 3.2 Vision / Minimax 3.1 Flash)
        if (!content) {
          try {
            content = await generateNvidia(openRouterMessages, {
              models: ["meta/llama-3.2-11b-vision-instruct", "minimaxai/minimax-m3.1-flash"],
              maxTokens: targetTokens,
              temperature: 0.82,
              timeoutMs: 5000,
              apiKey: nvidiaApiKey || undefined,
              validate: (reply) => !isOffRole(reply),
              isRepeated: isRepeatedReply,
            });
          } catch (err) {
            console.warn("Nvidia Magnum fallback failed:", err.message);
          }
        }
      } else if (isLiveCall) {
        // Fast real-time engine (< 400ms) for live voice phone calls
        if (isAdult) {
          try {
            content = await generateLocalLlama(openRouterMessages, {
              maxTokens: 55,
              temperature: 0.82,
              timeoutMs: 2500,
              validate: (reply) => !isOffRole(reply),
              isRepeated: isRepeatedReply,
            });
          } catch (err) {
            console.warn("Local llama live call adult failed:", err.message);
          }
          if (!content) {
            try {
              content = await generateOpenRouter(openRouterMessages, {
                models: [
                  "anthracite-org/magnum-v4-72b",
                  "sao10k/l3.3-euryale-70b",
                  "nvidia/nemotron-3.5-lightning:free",
                ],
                maxTokens: 55,
                temperature: 0.82,
                timeoutMs: 4000,
                apiKey: openRouterApiKey || undefined,
                validate: (reply) => !isOffRole(reply),
                isRepeated: isRepeatedReply,
              });
            } catch (err) {
              console.warn("OpenRouter live call adult fallback failed:", err.message);
            }
          }
          if (!content) {
            try {
              content = await generateNvidia(openRouterMessages, {
                models: ["meta/llama-3.2-11b-vision-instruct"],
                maxTokens: 55,
                temperature: 0.82,
                timeoutMs: 2500,
                apiKey: nvidiaApiKey || undefined,
                validate: (reply) => !isOffRole(reply),
                isRepeated: isRepeatedReply,
              });
            } catch (err) {
              console.warn("Nvidia live call adult fallback failed:", err.message);
            }
          }
        } else {
          const canTryGemini = Boolean(geminiApiKey || (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "[SENSITIVE]"));
          if (canTryGemini) {
            try {
              const geminiContents = contents.map((c) => ({ role: c.role, parts: [...(c.parts || [])] }));
              if (geminiContents[0]?.role === "model") {
                geminiContents.unshift({ role: "user", parts: [{ text: "Continúa la llamada telefónica." }] });
              }
              content = await generate(
                "gemini-2.5-flash",
                [],
                { maxOutputTokens: 55, temperature: 0.8 },
                {
                  contents: geminiContents,
                  systemInstruction,
                  adultMode: false,
                  apiKey: geminiApiKey || undefined,
                  timeoutMs: 3000,
                  fallbackModels: ["gemini-flash-latest", "gemini-2.5-pro"],
                  fastReply: true,
                  validate: (reply) => !isOffRole(reply)
                },
              );
            } catch (err) {
              console.warn("Gemini live call primary failed:", err.message);
            }
          }
          if (!content) {
            try {
              content = await generateLocalLlama(openRouterMessages, {
                maxTokens: 55,
                temperature: 0.82,
                timeoutMs: 2500,
                validate: (reply) => !isOffRole(reply),
                isRepeated: isRepeatedReply,
              });
            } catch (err) {
              console.warn("Local llama live call fallback failed:", err.message);
            }
          }
          if (!content) {
            try {
              content = await generateNvidia(openRouterMessages, {
                models: ["meta/llama-3.2-11b-vision-instruct"],
                maxTokens: 55,
                temperature: 0.82,
                timeoutMs: 2500,
                apiKey: nvidiaApiKey || undefined,
                validate: (reply) => !isOffRole(reply),
                isRepeated: isRepeatedReply,
              });
            } catch (err) {
              console.warn("Nvidia live call fallback failed:", err.message);
            }
          }
        }
      } else if (isDeluxeOrPremium) {
        // High-end models (Euryale 70B, DeepSeek, WizardLM, Grok)
        try {
          content = await generateOpenRouter(openRouterMessages, {
            models: openRouterModels,
            maxTokens: targetTokens,
            temperature: 0.78,
            timeoutMs: 6000,
            apiKey: openRouterApiKey || undefined,
            validate: (reply) => !isOffRole(reply),
            isRepeated: isRepeatedReply,
          });
        } catch (err) {
          console.warn("OpenRouter invocation failed:", err.message);
        }
        if (!content) {
          try {
            content = await generateLocalLlama(openRouterMessages, {
              maxTokens: targetTokens,
              temperature: 0.85,
              timeoutMs: 3500,
              validate: (reply) => !isOffRole(reply),
              isRepeated: isRepeatedReply,
            });
          } catch (err) {
            console.warn("Local llama fallback for deluxe failed:", err.message);
          }
        }
      } else if (modelId === "mistral-nemo" || modelId === "qwen-3.8-flash" || modelId === "glm-5.3-flash") {
        // Targeted free/open models
        try {
          content = await generateOpenRouter(openRouterMessages, {
            models: openRouterModels,
            maxTokens: targetTokens,
            temperature: 0.78,
            timeoutMs: 6000,
            apiKey: openRouterApiKey || undefined,
            validate: (reply) => !isOffRole(reply),
            isRepeated: isRepeatedReply,
          });
        } catch (err) {
          console.warn("OpenRouter free candidate failed:", err.message);
        }
        if (!content) {
          try {
            content = await generateLocalLlama(openRouterMessages, {
              maxTokens: targetTokens,
              temperature: 0.85,
              timeoutMs: 3500,
              validate: (reply) => !isOffRole(reply),
              isRepeated: isRepeatedReply,
            });
          } catch (err) {
            console.warn("Local llama fallback for free model failed:", err.message);
          }
        }
      } else {
        // Insomnia Flash para rol seguro / no adulto (Ultra-rápido ~1.2s en Gemini)
        const canTryGemini = !isAdult && Boolean(geminiApiKey || (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "[SENSITIVE]"));
        if (canTryGemini) {
          try {
            const geminiContents = contents.map((c) => ({ role: c.role, parts: [...(c.parts || [])] }));
            if (geminiContents[0]?.role === "model") {
              geminiContents.unshift({ role: "user", parts: [{ text: "Continúa la escena." }] });
            }
            content = await generate(
              "gemini-2.5-flash",
              [],
              { maxOutputTokens: Math.max(220, targetTokens), temperature: 0.8 },
              {
                contents: geminiContents,
                systemInstruction,
                adultMode: false,
                apiKey: geminiApiKey || undefined,
                timeoutMs: 16000,
                fallbackModels: ["gemini-flash-latest", "gemini-2.5-pro"],
                fastReply: true,
                validate: (reply) => !isOffRole(reply)
              },
            );
          } catch (err) {
            console.warn("Gemini Flash primary failed:", err.message);
          }
        }

        // 2. OpenRouter sin censura (~1.5s, modelos gratuitos ultra-rápidos para rol adulto)
        if (!content) {
          try {
            content = await generateOpenRouter(openRouterMessages, {
              models: [
                "nvidia/nemotron-3.5-lightning:free",
                "nvidia/nemotron-3.5-super-vl:free",
                "anthracite-org/magnum-v4-72b",
                "sao10k/l3.3-euryale-70b"
              ],
              maxTokens: targetTokens,
              temperature: 0.82,
              timeoutMs: 6000,
              apiKey: openRouterApiKey || undefined,
              validate: (reply) => !isOffRole(reply),
              isRepeated: isRepeatedReply,
            });
          } catch (err) {
            console.warn("OpenRouter fallback failed:", err.message);
          }
        }

        // 3. Magnum local v4 (si está activo el servidor llama-server en PC)
        if (!content) {
          try {
            content = await generateLocalLlama(openRouterMessages, {
              maxTokens: targetTokens,
              temperature: 0.85,
              timeoutMs: 3000,
              validate: (reply) => !isOffRole(reply),
              isRepeated: isRepeatedReply,
            });
          } catch (err) {
            console.warn("Local llama fallback failed:", err.message);
          }
        }

        // 4. Nvidia NIM (Minimax 3.1 Flash)
        if (!content) {
          try {
            content = await generateNvidia(openRouterMessages, {
              models: ["minimaxai/minimax-m3.1-flash"],
              maxTokens: targetTokens,
              temperature: 0.82,
              timeoutMs: 5000,
              apiKey: nvidiaApiKey || undefined,
              validate: (reply) => !isOffRole(reply),
              isRepeated: isRepeatedReply,
            });
          } catch (err) {
            console.warn("Nvidia fallback failed:", err.message);
          }
        }
      }

      // Fast fallback to Local Llama or Nvidia NIM if content is still null (for non-flash models)
      if (!content) {
        try {
          content = await generateLocalLlama(openRouterMessages, {
            maxTokens: targetTokens,
            temperature: 0.85,
            timeoutMs: 6000,
            validate: (reply) => !isOffRole(reply),
            isRepeated: isRepeatedReply,
          });
        } catch { /* ignore */ }
      }

      if (!content) {
        try {
          content = await generateNvidia(openRouterMessages, {
            models: nvidiaModels,
            maxTokens: targetTokens,
            temperature: 0.82,
            timeoutMs: 4000,
            apiKey: nvidiaApiKey || undefined,
            validate: (reply) => !isOffRole(reply),
            isRepeated: isRepeatedReply,
          });
        } catch (err) {
          console.warn("Nvidia fallback failed:", err.message);
        }
      }

      // Final fallback to OpenRouter uncensored models if still null
      if (!content) {
        try {
          content = await generateOpenRouter(openRouterMessages, {
            models: ["anthracite-org/magnum-v4-72b", "sao10k/l3.3-euryale-70b"],
            maxTokens: targetTokens,
            temperature: 0.82,
            timeoutMs: 4500,
            apiKey: openRouterApiKey || undefined,
            validate: (reply) => !isOffRole(reply),
            isRepeated: isRepeatedReply,
          });
        } catch (err) {
          console.warn("Final OpenRouter fallback failed:", err.message);
        }
      }

            if (!content || isRefusal(content)) {
        if (!isAdult) {
          try {
            const geminiContents = contents.map((c) => ({ role: c.role, parts: [...(c.parts || [])] }));
            if (geminiContents[0]?.role === "model") {
              geminiContents.unshift({ role: "user", parts: [{ text: "Continúa la escena." }] });
            }
            content = await generate(
              "gemini-2.5-flash",
              [],
              { maxOutputTokens: Math.max(200, targetTokens), temperature: 0.8 },
              {
                contents: geminiContents,
                systemInstruction,
                adultMode: false,
                apiKey: geminiApiKey || undefined,
                timeoutMs: 14000,
                fastReply: true,
                validate: (reply) => !isOffRole(reply)
              },
            );
          } catch { /* ignore */ }
        }
      }

      if (!content || isRefusal(content)) {
        try {
          content = await generateLocalLlama(openRouterMessages, {
            maxTokens: targetTokens,
            temperature: 0.85,
            validate: (reply) => !isOffRole(reply),
            isRepeated: isRepeatedReply,
          });
        } catch { /* ignore */ }
      }

      // Safe resilient emergency conversational turn
            if (!content || isRefusal(content)) {
        if (!isAdult) {
          try {
            const userText = latest || "Hola";
            content = await generate(
              "gemini-flash-latest",
              [{ text: `Continuación de escena en rol de ${characterName}:\n\nUsuario: ${userText}\n\n${characterName}:` }],
              { maxOutputTokens: Math.max(200, targetTokens), temperature: 0.8 },
              {
                systemInstruction,
                adultMode: false,
                apiKey: geminiApiKey || undefined,
                timeoutMs: 12000,
                fastReply: true,
              },
            );
          } catch { /* ignore */ }
        }
      }

      if (content && isRefusal(content)) {
        content = null;
      }

      if (content) {
        // 1. Purga estricta de caracteres chinos, japoneses u otros caracteres CJK
        content = content.replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u30ff]/g, "").trim();

        // 2. Purga de intrusiones de oraciones en inglés en modo español
        if (spanish) {
          content = content
            .replace(/\bagain\s+after\s+so\s+long\b/gi, "después de tanto tiempo")
            .replace(/\bafter\s+so\s+long\b/gi, "después de tanto tiempo")
            .replace(/\bi(?:'ve)?\s+missed\s+you\s+so\s+much\b/gi, "te he extrañado tanto")
            .replace(/\bi(?:'ve)?\s+missed\s+you\b/gi, "te extrañé")
            .replace(/\bso\s+good\s+to\s+see\s+you\b/gi, "qué bueno verte")
            .replace(/\bgood\s+to\s+see\s+you\b/gi, "qué bueno verte")
            .replace(/\boh\s+my\s+god\b/gi, "dios mío")
            .replace(/\bmy\s+love\b/gi, "mi amor")
            .replace(/\bsweetheart\b/gi, "cariño")
            .replace(/\bdarling\b/gi, "cariño")
            .replace(/\bhoney\b/gi, "cariño")
            .replace(/\bcome\s+here\b/gi, "ven aquí")
            .replace(/\bright\s+now\b/gi, "ahora mismo")
            .replace(/\b(exclama|dice|murmura|susurra|gime|sonr[ií]e)\s+([a-záéíóúñ]+)\./gi, (_m, a, b) => `*${a} ${b}.*`)
            .replace(/(?:^|\n|[.!?]\s+)(?:After\s+[^.!?]+|Under\s+the\s+cloak\s+of\s+[^.!?]+|I\s+can't\s+deny\s+[^.!?]+|Holding\s+your\s+[^.!?]+|Accidentally\s+tasting\s+[^.!?]+)[.!?]?/gi, ".").trim();
        }

        // 3. Purga estricta de Godmoding / Monólogo (eliminar párrafos donde la IA inventa acciones o diálogos para el usuario)
        content = content.replace(/(?:\n\s*|^)(?:Rompes\s+el\s+silencio|Miras\s+fijamente|Tomas\s+mi\s+mano|Te\s+acercas\s+a\s+mí|Dices\s+con\s+voz|Me\s+dices\s+con|Jadeas\s+con|Suspiras\s+mientras)[^.\n]*["“«][^"”»]+["”»][^\n]*/gi, "").trim();
        content = content.replace(/(?:\n\s*|^)Rompes\s+el\s+silencio[^\n]*/gi, "").trim();

        // 4. Purga automática de clichés moralizantes o protestas de conciencia
        content = content.replace(/\*A\s+pesar\s+de\s+las\s+protestas\s+de\s+conciencia[^*]*\*/gi, "").trim();
        content = content.replace(/\*(?:No\s+puedo\s+seguir\s+negando|aunque\s+esté\s+mal|pensamientos\s+prohibidos)[^*]*\*/gi, "").trim();
        content = content.replace(/^(?:Mmmh[.…]*\s*)?(?:tienes\s+(?:toda\s+la\s+)?razón(?:\s+\w+)?)[.,!:]*\s*/i, "").trim();
        content = content.replace(/Quiero liberar toda esta pasión que bulle dentro de mí sin restricciones ni tabúes\.?/gi, "").trim();
        content = content.replace(/sin restricciones ni tabúes\.?/gi, "").trim();
        content = content.replace(/pasión que bulle dentro de mí\.?/gi, "").trim();

        // 5. Purga estricta de rotura de cuarta pared
        content = content.replace(/\s*en\s+un\s+roleplay\s+(?:íntimo\s+)?(?:con\s+[a-záéíóúñ]+)?/gi, "").trim();
        content = content.replace(/\s*en\s+este\s+roleplay[.,]?/gi, "").trim();

        // 6. Enforzar proporción estricta: 80% diálogo hablado directo / 20% relato breve en asteriscos
        if (isLiveCall) {
          // Mantener acotaciones vocales acústicas (*se ríe*, *suspira*, *gime*, *jadea*, etc.) para el TTS neuronal
          // Solo eliminar narraciones largas de novela (> 35 caracteres entre asteriscos)
          content = content.replace(/\*([^*]{35,})\*/g, "").replace(/\s+/g, " ").trim() || content;
        } else {
          content = enforceDialogueRatio(content, Math.round(dialogueRatio * 100), Math.round(narrationRatio * 100));
        }

        // Eliminar palabras truncadas o conectores rotos al final (ej: "a las...", "las*", "con lent*", "de*", "en...")
        content = content.replace(/\s+(?:a\s+las?|a\s+los?|en\s+el|en\s+la|con\s+el|con\s+la|de\s+la|de\s+los|de\s+las|de\s+un|de\s+una|con\s+lent[a-z]*|lent[a-z]*|las?|los?|el|la|un[a-z]*|de|del|al|a|en|con|por|para|y|e|o|pero|que|su|mi|tu|tan|muy)\s*(?:\.{2,3}|…)?\*?$/iu, "").trim();

        // Equilibrar asteriscos sin cerrar
        const asteriskCount = (content.replace(/\*\*/g, "").match(/\*/g) || []).length;
        if (asteriskCount % 2 === 1) {
          const lastStar = content.lastIndexOf("*");
          const beforeStar = content.slice(0, lastStar).trim();
          if (beforeStar.length >= 15) {
            content = content + "*";
          } else {
            content = content + "*";
          }
        }

        // Si la respuesta termina sin puntuación terminal, recortar hasta la última oración completa o añadir punto
        if (content.length > 30 && !/[.!?…"”»*)\]]$/.test(content)) {
          const lastPunct = Math.max(content.lastIndexOf("."), content.lastIndexOf("!"), content.lastIndexOf("?"), content.lastIndexOf("…"), content.lastIndexOf("*"));
          if (lastPunct >= 20) {
            content = content.slice(0, lastPunct + 1).trim();
          } else {
            content = content + ".";
          }
        }

        // GARANTÍA DE DIÁLOGO: Si en modo chat la respuesta solo contiene asteriscos (cero diálogo hablado),
        // inyectar una frase hablada inmediata para cumplir siempre el 80% diálogo
        if (isChatPage && !isLiveCall) {
          const spokenPart = content.replace(/\*[^*]*\*/g, "").replace(/[^\w\s]/g, "").trim();
          if (spokenPart.length < 6) {
            const extraDialogue = spanish
              ? (content.endsWith("*") ? " " : "\n\n") + "Dime... ¿te gusta lo que ves? No me dejes con las ganas de escucharte."
              : (content.endsWith("*") ? " " : "\n\n") + "Tell me... do you like what you see? Don't leave me waiting to hear your voice.";
            content = content + extraDialogue;
          }
        }
        const totalActionMatches = [...content.matchAll(/\*([^*\n]+)\*/g)];
        const targetWords = Math.max(65, Math.round(targetTokens * 0.72));
        const maxWordsPerCue = Math.max(22, Math.round(targetWords * 0.28));
        let actionCount = 0;
        content = content.replace(/\*([^*\n]+)\*/g, (_m, inner) => {
          actionCount += 1;
          if (actionCount > 2) return "";
          const firstSentence = inner.replace(/\s+/g, " ").trim().split(/(?<=[.!?…])\s+/)[0].replace(/[.!?…]+$/, "").trim();
          const words = firstSentence.split(/\s+/).filter(Boolean);
          if (words.length <= maxWordsPerCue) return `*${firstSentence}*`;
          const clauses = firstSentence.split(/[,;]/);
          let clauseAcc = "";
          for (const c of clauses) {
            const cand = clauseAcc ? `${clauseAcc}, ${c.trim()}` : c.trim();
            if (cand.split(/\s+/).filter(Boolean).length <= maxWordsPerCue) clauseAcc = cand;
            else break;
          }
          const clauseWords = clauseAcc ? clauseAcc.split(/\s+/).filter(Boolean).length : 0;
          let sliced = clauseWords >= 8 && clauseWords <= maxWordsPerCue ? clauseAcc : words.slice(0, maxWordsPerCue).join(" ");
          while (DANGLING_TAIL_REGEX.test(sliced) && sliced.includes(" ")) {
            sliced = sliced.replace(/\s+\S+$/, "").trim();
          }
          return `*${sliced.replace(/[,;:\s]+$/, "").trim()}*`;
        });
        content = content.replace(/[ \t]{2,}/g, " ").replace(/\n{2,}/g, "\n").trim();
        const maxCharLimit = Math.max(650, targetTokens * 5);
        if (content.length > maxCharLimit) {
          const sentences = content.match(/[^.!?…]+[.!?…]+["'»”*)]*(?:\s+|$)/gu);
          if (sentences && sentences.length > 1) {
            let acc = "";
            for (const s of sentences) {
              if ((acc + s).length > maxCharLimit && acc.length >= 100) break;
              acc += s;
            }
            if (acc.trim()) content = acc.trim();
          }
        }
        if (((content.replace(/\*\*/g, "").match(/\*/g) || []).length) % 2 === 1) {
          content = content.replace(/\*[^*]*$/, "").trim();
        }
      }

      if (!content) {
        return send(res, 503, { error: "ai_unavailable", message: "El motor de IA estuvo ocupado un instante. Inténtalo de nuevo." });
      }
      return send(res, 200, { content });
    }
    if (action === "translate") {
      const texts = Array.isArray(body.texts) ? body.texts.slice(0, 50).map(s => String(s).slice(0, 1000)) : [];
      if (!texts.length) return send(res, 200, { translations: [] });
      const targetLang = body.targetLang === "es" ? "natural Spanish" : "natural English";
      const prompt = "Translate this JSON list into " + targetLang + ". Preserve names, acronyms and formatting. Return only a JSON array of strings of the same length (" + texts.length + ") and order:\n" + JSON.stringify(texts);
      let raw = "";
      try {
        raw = await generate("gemini-2.5-flash", [{ text: prompt }], { responseMimeType: "application/json", temperature: 0.2 }, { fallbackModels: ["gemini-flash-latest", "gemini-2.5-pro"] });
      } catch (err) {
        console.warn("Translation upstream error:", err.message);
        return send(res, 200, { translations: texts });
      }
      let translations = null;
      try {
        const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) translations = parsed;
        else if (Array.isArray(parsed?.translations)) translations = parsed.translations;
        else if (Array.isArray(parsed?.result)) translations = parsed.result;
        else if (Array.isArray(parsed?.data)) translations = parsed.data;
      } catch {
        translations = null;
      }
      if (!Array.isArray(translations) || translations.length !== texts.length) {
        console.warn("Translation length mismatch, returning safe list");
        const safe = Array.isArray(translations) && translations.length > 0
          ? texts.map((t, i) => (typeof translations[i] === "string" && translations[i].trim() ? translations[i].trim() : t))
          : texts;
        return send(res, 200, { translations: safe });
      }
      return send(res, 200, { translations: translations.map(String) });
    }
    if (action === "list-models") {
      const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      if (!key || key === "[SENSITIVE]") return send(res, 503, { error: "no_key" });
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models?key=" + key);
      if (!response.ok) return send(res, response.status, { error: "upstream_error" });
      const data = await response.json();
      return send(res, 200, data);
    }
    if (action === "speech-to-text") {
      return send(res, 200, await transcribeAudio(body));
    }
    if (action === "generate-narrative") {
      const story = body.story || {};
      const source = [story.title, story.description, story.story_context, story.character_role, story.player_role, body.scene].filter(Boolean).join("\n");
      const prompt = narrativeRequest(body);
      const options = {
        fastReply: true,
        fallbackModels: [],
        validate: (reply) => narrativeStays(source, reply),
      };
      const isAdultNarrative = Boolean(body.adultMode || body.isNsfw || body.isAdult || body.explicit || body.story?.adult_mode || body.story?.nsfw || body.story?.story_type === "real_sex" || body.story?.has_explicit_images || /(?:\+18|18\+|nsfw|er[o\u00f3]tic|sexual|hentai|\badult[oa]?\b)/i.test(source));
      let content = null;
      if (isAdultNarrative) {
        // En narrativa adulta, NUNCA usar Gemini (usar Llama local, OpenRouter Magnum o Nvidia)
        try {
          content = await generateLocalLlama([{ role: "user", content: prompt }], { maxTokens: 1200, temperature: 0.7, timeoutMs: 45000 });
        } catch { /* ignore */ }
        if (!content) {
          try {
            content = await generateOpenRouter([{ role: "user", content: prompt }], {
              models: ["anthracite-org/magnum-v4-72b", "sao10k/l3.3-euryale-70b", "nvidia/nemotron-3.5-lightning:free"],
              maxTokens: 1200,
              temperature: 0.7,
              timeoutMs: 10000,
            });
          } catch { /* ignore */ }
        }
        if (!content) {
          try {
            content = await generateNvidia([{ role: "user", content: prompt }], {
              models: ["meta/llama-3.2-11b-vision-instruct", "minimaxai/minimax-m3.1-flash"],
              maxTokens: 1200,
              temperature: 0.7,
              timeoutMs: 8000,
            });
          } catch { /* ignore */ }
        }
      } else {
        try {
          content = await generate("gemini-2.5-flash", [{ text: prompt }], { maxOutputTokens: 2000, temperature: 0.4 }, options);
        } catch (error) {
          if (error.code === "off_role") {
            try {
              content = await generate(
                "gemini-2.5-flash",
                [{ text: prompt + "\n\nEl intento anterior cambió la historia. Escribe solo la premisa, con las mismas personas y el mismo suceso, sin otra trama ni otra edad." }],
                { maxOutputTokens: 2000, temperature: 0.2 },
                options,
              );
            } catch {
              content = null;
            }
          }
          if (!content) {
            content = await generateNvidia([{ role: "user", content: prompt }], {
              models: ["google/diffusiongemma-26b-a4b-it", "nvidia/nemotron-3-super-120b-a12b"],
              maxTokens: 1200,
              temperature: 0.5,
              timeoutMs: 12000,
            });
          }
          if (!content) throw error;
        }
      }
      return send(res, 200, { content });
    }
    if (action === "generate-shorts-series") {
      const idea = String(body.premise || "").trim().slice(0, 1000);
      if (idea.length < 8) return send(res, 400, { error: "premise_too_short" });
      const count = Math.min(6, Math.max(1, Number(body.episodes) || 3));
      const prompt = "Escribe UNA novela en español, no una historia distinta. La idea es la única trama: mismas personas, mismo lugar y el mismo suceso en todos los capítulos. No inventes una edad, un parentesco ni un lugar que no estén en la idea. Devuelve solo JSON: " + JSON.stringify({ title: "", logline: "", episodes: [{ number: 1, title: "", script: "capítulo completo en prosa, continuación del anterior", video_prompt: "English visual description of this same chapter, 9:16, no captions" }] }) + ". Exactamente " + count + " capítulos en orden. Cada script tiene entre 500 y 1200 caracteres y continúa el capítulo anterior. Idea: " + idea;
      const raw = await generate("gemini-2.5-flash", [{ text: prompt }], { responseMimeType: "application/json", maxOutputTokens: 8000, temperature: 0.4 }, { fallbackModels: [] });
      const parsed = JSON.parse(raw);
      if (!parsed.title || !Array.isArray(parsed.episodes) || parsed.episodes.length !== count) throw Object.assign(new Error("Miniserie incompleta; intenta otra vez."), { status: 502 });
      const token = String(req.headers.authorization).replace(/^Bearer\s+/i, "");
      const userClient = createClient(BASE, KEY, { auth: { persistSession: false }, global: { headers: { Authorization: "Bearer " + token } } });
      const { data: { user } } = await userClient.auth.getUser(token);
      const referencePath = String(body.referencePath || "");
      const validReference = new RegExp("^" + user.id + "/[0-9a-f-]{36}\\.(png|jpg|jpeg|webp)$", "i").test(referencePath);
      if (referencePath && !validReference) return send(res, 400, { error: "reference_image_unavailable" });
      if (validReference) {
        const { data: imageBlob, error: imageError } = await userClient.storage.from("kineva-references").download(referencePath);
        if (imageError || !imageBlob || imageBlob.size === 0) return send(res, 400, { error: "reference_image_unavailable" });
      }
      const { data: series, error: seriesError } = await userClient.from("shorts_series").insert({
        title: String(parsed.title).slice(0, 120), premise: String(parsed.logline || idea).slice(0, 500),
        category: String(body.category || "romance").slice(0, 40), is_adult: !!body.isAdult, created_by: user.id,
        video_provider: "kineva", is_published: false,
        kineva_reference_image_path: validReference ? referencePath : null, kineva_bible: { language: "Spanish" },
      }).select().single();
      if (seriesError) throw Object.assign(new Error(seriesError.message), { status: 500 });
      const rows = parsed.episodes.map((ep, i) => ({
        series_id: series.id, episode_number: i + 1, title: String(ep.title || "Episodio " + (i + 1)).slice(0, 120),
        script: String(ep.script || ep.content || "").slice(0, 8000), video_prompt: String(ep.video_prompt || "").slice(0, 900), status: "pending",
      }));
      const { data: episodes, error: episodeError } = await userClient.from("shorts_episodes").insert(rows).select();
      if (episodeError) throw Object.assign(new Error(episodeError.message), { status: 500 });
      return send(res, 200, { series, episodes });
    }
    if (action === "generate-studio-draft") {
      const idea = String(body.description || "").trim().slice(0, 1500);
      if (idea.length < 10) return send(res, 400, { error: "description_too_short" });
      const language = body.language === "English" ? "English" : "español";
      const castNames = Array.isArray(body.cast_names) ? body.cast_names.slice(0, 20)
        .map((name) => String(name || "").trim().slice(0, 80)).filter(Boolean) : [];
      const locationName = String(body.location_name || "").trim().slice(0, 100);
      const locationDesc = String(body.location_description || "").trim().slice(0, 300);
      const props = Array.isArray(body.props) ? body.props.slice(0, 10).map((p) => String(p).trim()).filter(Boolean) : [];
      const count = Math.min(20, Math.max(1, Number(body.chapters || body.chapterCount || 3)));
      const prompt = `Actúa como un Showrunner y Director Cinematográfico de miniseries de alta gama (estilo ReelShort / DramaBox). `
        + `Crea el desglose técnico y guion de rodaje cinematográfico de exactamente ${count} capítulos a partir de la idea. `
        + "
REGLAS FUNDAMENTALES DE FILMACIÓN CINEMATOGRÁFICA:
"
        + "1. 'visual' (TOMA PRINCIPAL / MASTER SHOT): NUNCA escribas un resumen seco de una sola frase. Describe la toma principal con desglose cinematográfico completo: [TIPO DE PLANO Y CÁMARA] (ej. [PLANO MEDIO INTERIOR VEHÍCULO - CÁMARA EN MANO VIBRANDO] o [PLANO GENERAL PICADO]), [ILUMINACIÓN Y ATMÓSFERA] (niebla, lluvia, contrastes, reflejos de faros o tablero) y la [SECUENCIA DE ACCIÓN Y BLOCKING COMPLETO] detallando el movimiento físico visible paso a paso (ej. 'Conduce tenso aferrado al volante; mira al copiloto con extrañeza; al volver la vista al frente advierte la curva en pánico; frena bruscamente, da un volantazo, el auto derrapa soltando chispas y vuelca por el barranco').
"
        + "2. COBERTURA DE CÁMARA ('sub_shots'): En cada capítulo incluye un array 'sub_shots' con 1 o 2 subtomas complementarias para rodaje: Contraplano/Reacción en primer plano [PRIMER PLANO - REACCIÓN] y Plano Detalle o Acción mecánica [PLANO DETALLE / IMPACTO].
"
        + "3. DIÁLOGOS DE PERSONAJES: Cada capítulo debe tener su diálogo hablado directo por el actor en 'dialogue' (máximo 15 palabras, con carga dramática real) y el nombre exacto del actor en 'speaker'. Nunca atribuyas voces de hombres a mujeres.
"
        + "4. CERO METADATOS TÉCNICOS: Nunca incluyas '9:16', 'Capítulo X de Y', ni palabras como 'Ilustrar' en el texto narrativo ni en el diálogo.
"
        + (locationName ? `5. LOCACIÓN FIJA: Desarrolla las escenas en el set: "${locationName}"${locationDesc ? ` (${locationDesc})` : ""}. Mantén este set e iluminación en todas las tomas.
` : "")
        + (props.length ? `6. OBJETOS / PROPS CLAVE: Incorpora activamente estos objetos en las acciones físicas de los personajes: ${props.join(", ")}.
` : "")
        + "Devuelve solo JSON con esta estructura:
"
        + JSON.stringify({
          title: "Título dramático de la miniserie",
          cast_roles: [{ name: "Nombre del actor", role: "Papel dramático exacto" }],
          chapters: Array.from({ length: Math.min(count, 3) }, () => ({
            visual: "[PLANO MEDIO DINÁMICO] Iluminación cinematográfica. Acción corporal física detallada paso a paso...",
            dialogue: "Línea hablada real del personaje",
            speaker: "Nombre exacto del actor",
            sub_shots: [
              { visual: "[PRIMER PLANO - REACCIÓN] Rostro...", dialogue: "", speaker: "" },
              { visual: "[PLANO DETALLE / IMPACTO] Acción mecánica...", dialogue: "", speaker: "" }
            ]
          }))
        })
        + `.
Obligatorio: exactamente ${count} capítulos en el array chapters. Cada capítulo DEBE tener 'visual' cinematográfico completo, 'dialogue', 'speaker' y 'sub_shots'. Idioma: ${language}. Elenco disponible: `
        + JSON.stringify(castNames) + `. Idea: ${idea}`;
      let raw;
      try {
        raw = await generate("gemini-3.5-flash-lite", [{ text: prompt }],
          { responseMimeType: "application/json", maxOutputTokens: Math.max(2500, count * 650), temperature: 0.5 },
          { fallbackModels: ["gemini-3.1-flash-lite", "gemini-3.8-flash"], retryBadRequest: true });
      } catch (err) {
        // Fallback robusto para miniseries de adultos o si Gemini bloquea
        const local = await generateLocalLlama([{ role: "user", content: prompt + "
Responde exclusivamente en JSON válido." }], { maxTokens: Math.max(2500, count * 650) });
        if (local) raw = local;
        else {
          const cloud = await generateOpenRouter([{ role: "user", content: prompt + "
Responde exclusivamente en JSON válido." }], { maxTokens: Math.max(2500, count * 650) });
          if (cloud) raw = cloud;
          else throw err;
        }
      }
      const draft = JSON.parse(raw);
      if (!draft.title || !Array.isArray(draft.chapters) || draft.chapters.length < 1
          || draft.chapters.some((chapter) => String(chapter.visual || "").trim().length < 5)) {
        throw Object.assign(new Error(`El guion no trajo escenas completas.`), { status: 502 });
      }
      return send(res, 200, { draft });
    }
    if (action === "generate-novel") {
      const idea = String(body.description || "").trim().slice(0, 3500);
      if (idea.length < 10) return send(res, 400, { error: "description_too_short" });
      const count = Math.min(20, Math.max(3, Number(body.chapterCount) || 7));
      const prompt = "Escribe UNA novela en " + String(body.language || "español").slice(0, 40) + ". No es una historia nueva: sigue la idea al pie de la letra, con las mismas personas, el mismo lugar y el mismo suceso en cada capítulo. No inventes una edad ni un lugar que la idea no diga. Si la idea no habla de un menor, nadie es menor. Devuelve solo JSON: " + JSON.stringify({ title: "", logline: "", characters: [{ name: "", role: "", appearance: "", wardrobe: "", personality: "", voice: "", visual_prompt: "" }], setting: { place: "", time: "", visual_style: "" }, outline: "", chapters: [{ number: 1, title: "", summary: "", characters_present: [""], content: "capítulo completo que continúa el anterior", video_prompt: "one specific visible action from this chapter, setting and characters, 9:16, no captions", spoken_line: "one short line in the story language spoken by the main character, at most 13 words", shots: [{ visual: "first visible action and framing, one continuous shot", dialogue: "" }, { visual: "second distinct visible action in the same scene, one continuous shot", dialogue: "" }] }] }) + ". Exactamente " + count + " capítulos. Cada content tiene entre 500 y 1200 caracteres. El video_prompt describe una sola toma visible del capítulo, no toda la prosa. Cada capítulo incluye dos tomas en shots con acciones visuales distintas, mismo reparto, vestuario y lugar; cada diálogo es breve u opcional. spoken_line es opcional si no hay diálogo y nunca contiene instrucciones visuales. Idea: " + idea;
      const raw = await generate(
        "gemini-2.5-flash",
        [{ text: prompt }],
        { responseMimeType: "application/json", maxOutputTokens: 16000, temperature: 0.4 },
        { fallbackModels: ["gemini-3.1-flash-lite", "gemini-2.5-flash-lite", "gemini-3.8-flash"], timeoutMs: 90000, retryBadRequest: true }
      );
      const novel = JSON.parse(raw);
      if (!novel.title || !Array.isArray(novel.chapters) || novel.chapters.length !== count) throw Object.assign(new Error("Proyecto incompleto; intenta otra vez."), { status: 502 });
      for (const chapter of novel.chapters) {
        const line = String(chapter.spoken_line || "").trim();
        chapter.spoken_line = line.length <= 180 && line.split(/\s+/).length <= 20 ? line : "";
      }
      if (!mentionsMinor(idea) && mentionsMinor(JSON.stringify(novel.chapters))) {
        throw Object.assign(new Error("La novela inventó un menor que no está en tu idea. Vuelve a generarla."), { status: 502, code: "off_role" });
      }
      return send(res, 200, { novel });
    }
    return send(res, 404, { error: "feature_not_configured", message: "Esta funciÃ³n todavÃ­a no estÃ¡ conectada a Kineva." });
  } catch (error) {
    const status = Number(error.status) >= 400 && Number(error.status) <= 599 ? Number(error.status) : error.name === "TimeoutError" ? 504 : 500;
    console.error("Insomnia AI", action, status, error.message);
    return send(res, status, { error: error.code || "ai_error", message: error.message, details: error.details, attempts: error.attempts });
  }
}

