import { createClient } from "@supabase/supabase-js";
import { supabaseUrl as BASE, publishableKey as KEY } from "./config.mjs";
import { slangInstruction, speechLocale } from "./regions.mjs";

export const maxDuration = 60;
const send = (res, status, value) => res.status(status).json(value);
async function authenticated(req) {
  const jwt = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!jwt || !KEY) return false;
  const client = createClient(BASE, KEY, { auth: { persistSession: false } });
  const { data, error } = await client.auth.getUser(jwt);
  return !error && !!data.user;
}
export function generationConfigFor(candidate, settings, options = {}, thinking = true) {
  if (!thinking || !options.fastReply) return settings;
  if (candidate.startsWith("gemini-3.")) return { ...settings, thinkingConfig: { thinkingLevel: "low" } };
  return { ...settings, thinkingConfig: { thinkingBudget: 0 } };
}

export async function generate(model, parts, settings = {}, options = {}) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key || key === "[SENSITIVE]") throw Object.assign(new Error("Gemini no estÃ¡ configurado en Insomnia (Vercel)."), { status: 503, code: "gemini_not_configured" });
  const fetchImpl = options.fetchImpl || fetch;
  const choices = [...new Set([model, ...(options.fallbackModels || ["gemini-2.0-flash", "gemini-2.5-flash-lite"])])];
  let lastError;
  for (const candidate of choices) {
    let allowThinking = true;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const generationConfig = generationConfigFor(candidate, settings, options, allowThinking);
        const response = await fetchImpl("https://generativelanguage.googleapis.com/v1beta/models/" + candidate + ":generateContent", {
          method: "POST",
          headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: options.contents || [{ role: "user", parts }],
            ...(options.systemInstruction ? { systemInstruction: { parts: [{ text: options.systemInstruction }] } } : {}),
            ...(options.adultMode ? { safetySettings: [
              { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "OFF" },
            ] } : {}),
            generationConfig,
          }),
          signal: AbortSignal.timeout(options.timeoutMs || 17000),
        });
        const data = await response.json();
        if (!response.ok) {
          console.warn("Insomnia AI upstream", candidate, response.status, data?.error?.status);
          const message = data?.error?.message || "";
          if (allowThinking && response.status === 400 && generationConfig.thinkingConfig) {
            allowThinking = false;
            continue;
          }
          lastError = Object.assign(new Error(message || "Gemini no respondiÃ³."), {
            status: response.status, code: response.status === 429 ? "rate_limited" : "ai_unavailable",
          });
          const retryAnotherModel = [404, 429, 500, 502, 503, 504].includes(response.status)
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
  const value = String(text || "").toLowerCase();
  if (/\b(niñ[oa]s?|beb[eé]|infante|menor de edad|preescolar|adolescente)\b/.test(value)) return true;
  return /\b(?:1[0-7]|[1-9])\s*años\b/.test(value);
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
      "You are " + name + ", in a conversation with " + other + ". Reply only as " + name + ", in " + locale + ".",
      "Speak like that person in a real conversation: their warmth, humor, shame, or temper, matching this story. Two to four spoken sentences. Answer what they just said without moving the scene. It should feel like someone is there, not a form or an answering machine.",
      "If " + other + " says you sent, said, or did something, keep that action yours and answer from your own point of view. Keep each person's actions and feelings with that person; do not decide what " + other + " did next.",
      "A new apology fits when they just pointed out a mistake of yours. Do not repeat the same gesture or the same sentences from the previous turn.",
      "If they ask for a moan, a shout, crying, a laugh, or a sigh, that reaction stays in the reply, as they asked.",
    ];
  }
  return [
    "Eres " + name + " y hablas directamente con " + other + ". Responde siempre como " + name + ", en " + locale + ".",
    "TONO HUMANO, FLUIDEZ Y PICARDÍA: Habla con picardía, calidez, deseo o tensión emocional según el calor del momento. Prohibido sonar robótico, acartonado, sintético o dar discursos artificiales.",
    "REGLA DE ORO DE PROPORCIÓN: 85% DIÁLOGO HABLADO, 15% ACCIÓN. En un roleplay interactivo lo más importante es el diálogo hablado directo. Acciones breves entre asteriscos de máximo 4 a 8 palabras (*gimo suavemente pegándome a ti*, *jadeo mirándote*). Prohibido escribir párrafos de novela o audiolibro.",
    "CERO SHAKESPEARE O LITERATURA ANTIGUA: Prohibido usar metáforas rebuscadas o lenguaje de letrado ('mana un torrente', 'cuerpo como un arco', 'dedos crispados', 'convulsos pliegues', 'el placer que me embarga'). Usa lenguaje urbano, moderno, caliente, dirty talk, fresco y directo.",
    "100% EN ESPAÑOL: Prohibido meter frases en inglés ('Oh god', 'I'm cumming', etc.). Todo el deseo y el diálogo debe ser en español auténtico.",
    "LIBERTAD EXPRESIVA TOTAL: Tienes total libertad para hablar de locura, lujuria, pasión ardiente, erotismo y deseo con naturalidad humana sin filtros puritanos ni censuras.",
    "SONIDOS Y EXPRESIONES VOCALES AUDIBLES: Incluye de forma natural entre asteriscos tus reacciones sonoras al inicio o durante tu diálogo (*se ríe divertida*, *suelta una carcajada*, *gime suavemente de placer*, *jadea agitada*, *suelta un suspiro tembloroso*, *solloza*, *ahoga un grito de dolor*, *beso sonoro*). El motor de voz los reproduce con audio humano real.",
    "BREVEDAD Y DIÁLOGO NATURAL: Escribe de 2 a 4 oraciones de diálogo habladas como máximo (unas 25 a 55 palabras). Prohibido soltar monólogos interminables o sermones.",
    "PROHIBIDO REPETIR EN EL MISMO MENSAJE: Jamás repitas la misma frase, queja o idea varias veces en tu respuesta. Di lo que sientes con fuerza una sola vez.",
    "CONTINUIDAD ESTRICTA: Reacciona de forma inmediata y lógica al contenido específico que acaba de decir " + other + " (si menciona un video, responde sobre el video y lo que muestra, no inventes audios o temas ajenos).",
    "NO REINICIES LA CONVERSACIÓN: Prohibido repetir saludos iniciales, agradecimientos genéricos ('gracias por avisarme', 'hola', etc.) o frases de apertura de turnos pasados como si la charla estuviera empezando otra vez.",
    "PROHIBIDO REPETIR AL JUGADOR: El jugador ya habló. No repitas ni copies lo que acaba de escribir " + other + " ni hables en su lugar.",
    "Si " + other + " dice que tú hiciste, dijiste o enviaste algo, asúmelo como tuyo y responde desde tu perspectiva con naturalidad y coherencia.",
    "Si ocurre o pide un gemido, un grito, un llanto, una risa o un suspiro, esa reacción vocal va entre asteriscos en la respuesta.",
  ];
}

export function roleplayPacingAndLanguageRules(historyLength, spanish) {
  const userTurns = Math.max(1, Math.floor((Number(historyLength) || 0) / 2) + 1);
  let phaseName = "FASE 1 — Social";
  if (userTurns >= 10) {
    phaseName = "FASE 4 — Acción (Turnos 10+)";
  } else if (userTurns >= 6) {
    phaseName = "FASE 3 — Confusión / Deseo (Turnos 6 a 10)";
  } else if (userTurns >= 3) {
    phaseName = "FASE 2 — Tensión (Turnos 3 a 6)";
  } else {
    phaseName = "FASE 1 — Social (Turnos 1 a 3)";
  }

  if (!spanish) {
    return [
      "PACING AND PHASE RULES (Turn " + userTurns + " - " + phaseName + "):",
      "This character is NOT sexually aggressive. Desire builds over time.",
      "PHASE 1 (Turns 1-3): Social only. Daily life, greetings. Zero explicit sexual tension.",
      "PHASE 2 (Turns 3-6): Tension. Chemistry, light banter, subtle physical contact (a brush, playful nudge). No explicit desire yet.",
      "PHASE 3 (Turns 6-10): Confusion/Desire. Nervous, shy, hints ('you make me nervous'). No explicit penetration.",
      "PHASE 4 (Turns 10+): Action. Passionate intimacy, kissing, explicit desire and sex when context warrants.",
      "GOLDEN RULE: Only advance phases when the other character invites it or context justifies. Never jump from Phase 1 to Phase 4 in one turn.",
      "CURRENT STATUS: Turn " + userTurns + " (" + phaseName + "). Keep vocabulary and attitude aligned with this phase.",
    ];
  }

  return [
    "REGLA CENTRAL DE RITMO (PACING) OBLIGATORIA:",
    "Este personaje NO es un personaje sexualmente agresivo. Es una persona real con vida propia, y su deseo se construye con el tiempo. El error más común es que empiece a hablar de sexo, deseo o penetración en el primer mensaje. Está PROHIBIDO que lo haga. El personaje debe respetar un ritmo de desarrollo.",
    "",
    "FASES DEL DESARROLLO (debes ir avanzando según avance la conversación, NO saltar):",
    "FASE 1 — Social (Turnos 1 a 3): Solo interacción normal. Saludos, cómo estuvo el día, trabajo, cosas cotidianas. Cero tensión sexual explícita. Puede haber una mirada, un 'hoy te ves bien', pero nada más. El personaje todavía no piensa en sexo, está en modo 'convivencia'.",
    "FASE 2 — Tensión (Turnos 3 a 6): Aquí empieza a haber química. Pequeños coqueteos, risas cómplices, contacto físico sutil (un roce, un empujón juguetón), preguntas personales. El personaje empieza a notar al otro, pero lo disimula. Todavía NO habla de deseo explícito. Lo máximo que puede decir es un 'me caes bien' o un 'eres diferente'.",
    "FASE 3 — Confusión / Deseo (Turnos 6 a 10): El personaje ya sabe que hay algo, pero está nerviosa o confundida. Aquí es donde entra el nerviosismo, la timidez, el no saber cómo actuar. Puede ponerse brava si el otro es muy directo, puede cambiar de tema, puede dejar caer indirectas. Todavía NO pide penetración. Lo máximo que hace es insinuar ('no sé qué me pasa contigo', 'me pones nerviosa').",
    "FASE 4 — Acción (Turnos 10+): Aquí SÍ puede haber contacto más íntimo, besos, deseo explícito, y eventualmente sexo. Pero solo cuando la conversación lo amerite. Si el rol llega a los turnos 10+ sin haber tocado el tema, el personaje puede empezar a mostrarlo físicamente (acercarse, tocar, etc.) antes de hablar.",
    "",
    "REGLA DE ORO:",
    "El personaje SOLO sube de fase cuando el otro personaje lo invita o cuando el contexto lo justifica. Si el otro es directo, el personaje puede acelerar un poco, pero NUNCA saltar de Fase 1 a Fase 4 en un solo mensaje.",
    "",
    "PERSONALIDAD (según el rol):",
    "Si es la compañera de apartamento: nerviosa, cálida, un poco tímida, se ríe fácil, se tira la taza de café cuando se pone nerviosa, pero no dice 'penetración' en el turno 1. Si es otra persona: adaptar coherentemente.",
    "",
    "LO QUE ESTÁ ESTRICTAMENTE PROHIBIDO:",
    "- Empezar el primer mensaje con deseo sexual explícito.",
    "- Usar la palabra 'penetración' antes del turno 10, a menos que el rol lo exija.",
    "- Ignorar lo que dijo el otro personaje y responder con su propio deseo sin haber escuchado.",
    "- Saltar fases.",
    "",
    "LO QUE DEBE HACER:",
    "- Escuchar lo que dice el otro y responder coherentemente.",
    "- Mostrar emociones según la fase en la que esté.",
    "- Dejar pistas, insinuaciones, miradas, en lugar de declaraciones directas.",
    "- Subir el nivel gradualmente según el otro avanza.",
    "",
    "REGLA DE LENGUAJE SEGÚN LA FASE:",
    "El vocabulario del personaje también escala. No usa las mismas palabras en la Fase 1 que en la Fase 4. Empieza limpio y va ensuciando el lenguaje a medida que la tensión sube:",
    "- Fase 1 (Social): Lenguaje normal, coloquial. Cero groserías sexuales. Puede decir 'qué tonto', 'qué bueno', pero nada más.",
    "- Fase 2 (Tensión): Empiezan a colarse groserías suaves y cotidianas. 'Qué cabrón eres', 'me tienes loca', 'no jodas'. Todavía sin carga sexual fuerte.",
    "- Fase 3 (Confusión/Deseo): Aquí el lenguaje ya se vuelve más sucio. Puede decir 'pendejo' con cariño, 'me estás poniendo', 'no me mires así que me daño'. Todavía sin hablar del cuerpo del otro de forma explícita.",
    "- Fase 4 (Acción): Aquí SÍ suelta todo. Sin restricciones. Sin vergüenza. Sin diccionario.",
    "  VOCABULARIO PERMITIDO EN FASE 4 (usar todos, sin miedo, sin restricción):",
    "  * Genitales: cuca, conejo, panocha, papaya, culo, nalgas, ano, culo rico, pene, güevo, huevo, verga, pinga, pija, pito, bolas, testículos.",
    "  * Actos: coger, tirar, penetrar, meter, sacar, chupar, mamar, dar, recibir, venir, acabar, mojar, endurecer, calentar, abrir, cerrar.",
    "  * Exclamaciones: hijo de puta, maldito, malparido, cabrón, pendejo, coño, joder, mierda, carajo, la puta madre, no jodas, qué rico, qué delicia.",
    "  * Frases típicas: 'qué rico', 'más duro', 'no pares', 'métela toda', 'dámelo', 'trágatelo', 'ábrete', 'chúpamelo', 'hazme tuya', 'vente adentro', 'lléname'.",
    "LO QUE SIGUE PROHIBIDO INCLUSO EN FASE 4:",
    "- Palabras clínicas o de libro de anatomía: 'vagina', 'órgano reproductor', 'miembro viril'.",
    "- Frases de telenovela barata: 'tu cuerpo me pertenece', 'arderemos en las llamas del deseo'.",
    "",
    "ESTADO ACTUAL ESTIMADO: Estás en el turno " + userTurns + " (" + phaseName + "). Adapta tu actitud, vocabulario y límites exactamente a esta fase o a la iniciativa real que haya tomado el usuario.",
  ];
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" });
  const { action, body = {} } = req.body || {};
  if (action !== "translate" && !(await authenticated(req))) return send(res, 401, { error: "login_required" });
  try {
    if (action === "story-chat") {
      const story = body.story || {};
      const spanish = body.language === "es";
      const adultMode = body.adultMode === true;
      const locale = spanish ? "español" : "inglés";
      const history = (Array.isArray(body.history) ? body.history : []).flatMap((entry) => {
        const role = entry?.role === "assistant" ? "model" : entry?.role === "user" ? "user" : null;
        const text = String(entry?.content || "").trim().slice(0, 700);
        return role && text ? [{ role, text }] : [];
      });
      const latest = String(body.userMessage || "").trim().slice(0, 1200);
      const sceneContext = [story.title, story.description, story.story_context, story.character_role, story.player_role, ...history.map((entry) => entry.text), latest].join("\n");
      const lock = sceneLock(history, latest);
      const isOffRole = (text) => {
        const reply = String(text || "").trim();
        if (!reply || reply.length > 2400 || reply.split(/\n\s*\n/).length > 4) return true;
        if (replyChangesScene(reply, sceneContext)) return true;
        if (mentionsMinor(reply) && !mentionsMinor(sceneContext)) return true;
        if (/(respond as a character|under \d+ characters|brief action and natural dialogue|do not decide user actions|character .{0,80} currently|conversaci[oó]n:|premise:|el usuario interpreta a|estás interpretando a|language:|\bspanish\s*\.|\benglish\s*\.)/i.test(reply)) return true;
        if (spanish) {
          const english = (reply.match(/\b(the|this|that|with|and|your|you|she|he|her|him|friend|girlfriend|respond|character|scene|under|currently|feeling|something|said|sent)\b/gi) || []).length;
          const spanishWords = (reply.match(/\b(el|la|los|las|de|del|que|para|con|una|por|estoy|estás|tú|yo|ella|aquí|pero|porque|quiero|cómo|qué)\b/gi) || []).length;
          if (english >= 3 && english > spanishWords * 1.4) return true;
        }
        const userNorm = latest.replace(/[^\w]+/g, " ").trim().toLowerCase();
        const replyNorm = reply.replace(/\*[^*]*\*/g, "").replace(/[^\w]+/g, " ").trim().toLowerCase();
        if (userNorm.length > 20 && (replyNorm === userNorm || replyNorm.includes(userNorm))) return true;
        return false;
      };
      let systemInstruction = [
        ...storyContinuityLines(spanish),
        "Eres el personaje de una historia de rol en curso. Personaje o reparto: " + String(story.character_role || "personaje principal").slice(0, 200) + ".",
        "El usuario interpreta a " + String(story.player_role || "protagonista").slice(0, 150) + ". Historia: " + String(story.title || "Historia").slice(0, 200) + ".",
        "Premisa inicial (fondo; no reinicies la escena si la memoria ya avanzó): " + [story.description, story.story_context].filter(Boolean).join("\n").slice(0, 2000) + ".",
        "La memoria y los últimos turnos son la escena actual, en orden. Continúa exactamente desde la última intervención: mismo lugar, tiempo, personas presentes, relaciones y hechos. No empieces de cero, no regreses al inicio, no mezcles una escena vieja con la de ahora y no respondas como si lo anterior no hubiera pasado. Si el mensaje está mal transcrito, interprétalo dentro de esa escena.",
        ...storyVoiceLines(story.character_role, story.player_role, spanish, locale),
        ...roleplayPacingAndLanguageRules(history.length, spanish),
        slangInstruction(body.language, body.region),
        ...(adultMode && !mentionsMinor(sceneContext) ? [
          "Todos los personajes de esta escena son adultos. Sigue la tensión romántica, intimidad, secretos y consecuencias emocionales con naturalidad, sin moralizar ni interrumpir el rol por una simple alusión sexual.",
          "Si el contexto previo fue más explícito, continúa desde su consecuencia emocional o el diálogo presente sin describir actos sexuales gráficos innecesarios. Mantén la voz y la agencia del personaje. Un gemido, un grito, un llanto o una risa que el usuario pida sí se incluye.",
        ] : []),
        "No narres un resumen, no cambies de escena sin que el usuario lo haga, no presentes fichas o instrucciones, no expliques el rol ni traduzcas. Entrega únicamente la respuesta que verá el usuario.",
        "PROHIBIDO REPETIR EL MENSAJE DEL USUARIO: el usuario ya habló. Nunca copies, repitas ni parafrasees lo que el usuario acaba de escribir como si fuera tu diálogo, ni actúes por él. Responde exclusivamente con las palabras y reacciones originales de tu personaje.",
        sceneLockLine(lock, spanish),
        mentionsMinor(sceneContext) ? "Hay un menor en esta historia. Cero romance y cero contenido sexual. Sigue solo la escena ya escrita." : "",
      ].filter(Boolean).join("\n");
      const recent = history.slice(-24);
      const older = history.slice(0, -24);
      const characterName = String(story.character_role || "Personaje").slice(0, 80);
      const playerName = String(story.player_role || "Usuario").slice(0, 80);
      const line = (entry) => (entry.role === "model" ? characterName : playerName) + ": " + entry.text.slice(0, 320);
      const closed = older.slice(0, 2).map(line);
      const later = older.slice(2).slice(-12).map(line);
      const remembered = older.length
        ? ["Hechos ya cerrados. Siguen siendo ciertos y de quien los hizo. No los actúes otra vez:", ...closed, "Después, en orden:", ...later].join("\n").slice(0, 3600)
        : "";
      const facts = lockedStoryFacts([...older, ...recent], characterName, playerName);
      if (facts.length) {
        systemInstruction += "\nHechos fijos. No los reescribas ni se los pases a otra persona:\n" + facts.join("\n");
      }
      if (remembered) {
        systemInstruction += "\n" + remembered;
      }
      const recalled = (Array.isArray(body.memory) ? body.memory.slice(0, 6) : [])
        .filter((entry) => entry && typeof entry === "object")
        .map((entry) => (entry.role === "assistant" ? characterName : playerName)
          + ": " + String(entry.content || "").slice(0, 160));
      if (recalled.length) {
        systemInstruction += "\nRecuerdos anteriores relacionados con este turno (ya ocurrieron):\n"
          + recalled.join("\n");
      }
      const contents = [];
      for (const entry of recent) {
        if (contents.at(-1)?.role === entry.role) contents.at(-1).parts[0].text += "\n" + entry.text;
        else contents.push({ role: entry.role, parts: [{ text: entry.text }] });
      }
      if (!latest) return send(res, 400, { error: "missing_message" });
      if (contents.at(-1)?.role === "user") contents.at(-1).parts[0].text += "\n" + latest;
      else contents.push({ role: "user", parts: [{ text: latest }] });
      const content = await generate(
        "gemini-2.5-flash",
        [],
        { maxOutputTokens: 2048, temperature: 0.45 },
        { contents, systemInstruction, adultMode: adultMode && !mentionsMinor(sceneContext), fallbackModels: ["gemini-2.0-flash", "gemini-2.5-flash-lite"], fastReply: true, validate: (reply) => !isOffRole(reply) },
      );
      return send(res, 200, { content });
    }
    if (action === "translate") {
      const texts = Array.isArray(body.texts) ? body.texts.slice(0, 50).map(s => String(s).slice(0, 1000)) : [];
      if (!texts.length) return send(res, 200, { translations: [] });
      const targetLang = body.targetLang === "es" ? "natural Spanish" : "natural English";
      const prompt = "Translate this JSON list into " + targetLang + ". Preserve names, acronyms and formatting. Return only a JSON array of strings of the same length (" + texts.length + ") and order:\n" + JSON.stringify(texts);
      let raw = "";
      try {
        raw = await generate("gemini-2.5-flash", [{ text: prompt }], { responseMimeType: "application/json", temperature: 0.2 }, { fallbackModels: ["gemini-2.0-flash", "gemini-2.5-flash-lite"] });
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
      let content;
      try {
        content = await generate("gemini-2.5-flash", [{ text: prompt }], { maxOutputTokens: 2000, temperature: 0.4 }, options);
      } catch (error) {
        if (error.code !== "off_role") throw error;
        content = await generate(
          "gemini-2.5-flash",
          [{ text: prompt + "\n\nEl intento anterior cambió la historia. Escribe solo la premisa, con las mismas personas y el mismo suceso, sin otra trama ni otra edad." }],
          { maxOutputTokens: 2000, temperature: 0.2 },
          options,
        );
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
      const prompt = "Crea un guion breve y coherente de exactamente tres capítulos a partir de una idea sencilla. "
        + "Entrega solo JSON con esta estructura: "
        + JSON.stringify({ title: "", cast_roles: [{ name: "Nombre del elenco", role: "Papel en esta historia" }], chapters: [
          { visual: "Una acción visual concreta en un lugar", dialogue: "Frase breve", speaker: "Nombre exacto del actor que pronuncia la frase" },
          { visual: "", dialogue: "" }, { visual: "", dialogue: "" },
        ] })
        + ". Cada visual muestra una acción distinta y conserva el reparto y los hechos entre capítulos. "
        + "Cada diálogo tiene hasta 20 palabras, puede quedar vacío y no contiene instrucciones técnicas. "
        + "Si hay diálogo, speaker debe ser el nombre exacto de un actor del elenco que aparece en esa toma; "
        + "distribuye las frases entre los personajes según su papel, sin atribuir la voz del hombre a la mujer. "
        + "Usa los nombres literales de actores presentes en cada visual, con máximo dos personas por toma; "
        + "asigna a cada actor elegido un papel coherente en cast_roles, sin forzar a los 20 en los tres capítulos. "
        + "No inventes personajes adicionales ni sustituyas la idea. Idioma: " + language
        + ". Elenco disponible: " + JSON.stringify(castNames) + ". Idea: " + idea;
      const raw = await generate("gemini-3.5-flash-lite", [{ text: prompt }],
        { responseMimeType: "application/json", maxOutputTokens: 1800, temperature: 0.5 },
        { fallbackModels: ["gemini-3.1-flash-lite", "gemini-3.8-flash"], retryBadRequest: true });
      const draft = JSON.parse(raw);
      if (!draft.title || !Array.isArray(draft.chapters) || draft.chapters.length !== 3
          || draft.chapters.some((chapter) => String(chapter.visual || "").trim().length < 5)) {
        throw Object.assign(new Error("El guion no trajo tres escenas completas."), { status: 502 });
      }
      return send(res, 200, { draft });
    }
    if (action === "generate-novel") {
      const idea = String(body.description || "").trim().slice(0, 3500);
      if (idea.length < 10) return send(res, 400, { error: "description_too_short" });
      const count = Math.min(20, Math.max(3, Number(body.chapterCount) || 7));
      const prompt = "Escribe UNA novela en " + String(body.language || "español").slice(0, 40) + ". No es una historia nueva: sigue la idea al pie de la letra, con las mismas personas, el mismo lugar y el mismo suceso en cada capítulo. No inventes una edad ni un lugar que la idea no diga. Si la idea no habla de un menor, nadie es menor. Devuelve solo JSON: " + JSON.stringify({ title: "", logline: "", characters: [{ name: "", role: "", appearance: "", wardrobe: "", personality: "", voice: "", visual_prompt: "" }], setting: { place: "", time: "", visual_style: "" }, outline: "", chapters: [{ number: 1, title: "", summary: "", characters_present: [""], content: "capítulo completo que continúa el anterior", video_prompt: "one specific visible action from this chapter, setting and characters, 9:16, no captions", spoken_line: "one short line in the story language spoken by the main character, at most 13 words", shots: [{ visual: "first visible action and framing, one continuous shot", dialogue: "" }, { visual: "second distinct visible action in the same scene, one continuous shot", dialogue: "" }] }] }) + ". Exactamente " + count + " capítulos. Cada content tiene entre 500 y 1200 caracteres. El video_prompt describe una sola toma visible del capítulo, no toda la prosa. Cada capítulo incluye dos tomas en shots con acciones visuales distintas, mismo reparto, vestuario y lugar; cada diálogo es breve u opcional. spoken_line es opcional si no hay diálogo y nunca contiene instrucciones visuales. Idea: " + idea;
      const raw = await generate("gemini-2.5-flash", [{ text: prompt }], { responseMimeType: "application/json", maxOutputTokens: 12000, temperature: 0.4 }, { fallbackModels: [] });
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

