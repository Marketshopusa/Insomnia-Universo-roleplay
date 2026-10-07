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
  if (candidate === "gemini-3.8-flash") return { ...settings, thinkingConfig: { thinkingLevel: "low" } };
  return { ...settings, thinkingConfig: { thinkingBudget: 0 } };
}

export async function generate(model, parts, settings = {}, options = {}) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key || key === "[SENSITIVE]") throw Object.assign(new Error("Gemini no estÃ¡ configurado en Insomnia (Vercel)."), { status: 503, code: "gemini_not_configured" });
  const fetchImpl = options.fetchImpl || fetch;
  const choices = [...new Set([model, ...(options.fallbackModels || ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"])])];
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
          if (allowThinking && response.status === 400 && generationConfig.thinkingConfig && /thinking/i.test(message)) {
            allowThinking = false;
            continue;
          }
          lastError = Object.assign(new Error(message || "Gemini no respondiÃ³."), {
            status: response.status, code: response.status === 429 ? "rate_limited" : "ai_unavailable",
          });
          const retryAnotherModel = [404, 429, 500, 502, 503, 504].includes(response.status)
            || (options.allowEmpty && response.status === 400);
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

export async function transcribeAudio(body, options = {}) {
  if (typeof body.audio !== "string" || body.audio.length < 2700 || body.audio.length > 12000000) {
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
  const locale = speechLocale(language, body.region);
  const ask = async (requestBody) => {
    let current = requestBody;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetchImpl("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-transcribe:generateContent", {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify(current),
        signal: AbortSignal.timeout(30000),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) return { text: transcriptFrom(data) };
      const message = data?.error?.message || "";
      if (attempt === 0 && response.status === 400 && current.generationConfig) {
        current = { contents: current.contents };
        continue;
      }
      throw Object.assign(new Error(message || "No se pudo transcribir el micrófono."), {
        status: response.status, code: "stt_failed",
      });
    }
    return { text: "" };
  };
  try {
    const uploaded = await fetchImpl("https://generativelanguage.googleapis.com/upload/v1beta/files", {
      method: "POST",
      headers: {
        "x-goog-api-key": key,
        "X-Goog-Upload-Protocol": "raw",
        "X-Goog-Upload-Command": "start, upload, finalize",
        "X-Goog-Upload-Header-Content-Length": String(bytes.length),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": mimeType,
      },
      body: bytes,
      signal: AbortSignal.timeout(20000),
    });
    const uploadedData = await uploaded.json().catch(() => ({}));
    const fileUri = uploadedData.file?.uri || uploadedData.uri;
    if (uploaded.ok && fileUri) return await ask(speechToTextBody(fileUri, mimeType, locale));
  } catch (error) {
    if (error.code === "stt_failed") throw error;
  }
  return ask({
    contents: [{ role: "user", parts: [{ inlineData: { mimeType, data: body.audio } }] }],
    generationConfig: { audioTranscriptionConfig: { languageCodes: [locale] } },
  });
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
    "Eres " + name + " y hablas con " + other + ". Responde solo como " + name + ", en " + locale + ".",
    "Habla como esa persona en una conversación real: con su forma de querer, su humor, su vergüenza o su carácter, según esta historia. Dos a cuatro frases dichas en voz alta. Contesta lo que acaban de decirte sin mover la escena. Que se sienta alguien al otro lado, no una ficha ni un contestador.",
    "Si " + other + " dice que tú enviaste, dijiste o hiciste algo, conserva esa acción como tuya y contesta desde tu punto de vista. Mantén las acciones y sentimientos de cada persona en su lugar; no decidas lo que " + other + " hizo después.",
    "Una disculpa nueva sí cabe cuando acaba de señalar un error tuyo. Prohibido repetir el gesto o las mismas frases del turno anterior.",
    "Si pide un gemido, un grito, un llanto, una risa o un suspiro, esa reacción va en la respuesta, tal como la pidió.",
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
        if (!reply || reply.length > 720 || reply.split(/\n\s*\n/).length > 3) return true;
        if (replyChangesScene(reply, sceneContext)) return true;
        if (mentionsMinor(reply) && !mentionsMinor(sceneContext)) return true;
        if (/(respond as a character|under \d+ characters|brief action and natural dialogue|do not decide user actions|character .{0,80} currently|conversaci[oÃ³]n:|premise:|el usuario interpreta a|estÃ¡s interpretando a|language:|\bspanish\s*\.|\benglish\s*\.)/i.test(reply)) return true;
        if (spanish) {
          const english = (reply.match(/\b(the|this|that|with|and|your|you|she|he|her|him|friend|girlfriend|respond|character|scene|under|currently|feeling|something|said|sent)\b/gi) || []).length;
          const spanishWords = (reply.match(/\b(el|la|los|las|de|del|que|para|con|una|por|estoy|estÃ¡s|tÃº|yo|ella|aquÃ­|pero|porque|quiero|cÃ³mo|quÃ©)\b/gi) || []).length;
          if (english >= 3 && english > spanishWords * 1.4) return true;
        }
        return false;
      };
      let systemInstruction = [
        ...storyContinuityLines(spanish),
        "Eres el personaje de una historia de rol en curso. Personaje o reparto: " + String(story.character_role || "personaje principal").slice(0, 200) + ".",
        "El usuario interpreta a " + String(story.player_role || "protagonista").slice(0, 150) + ". Historia: " + String(story.title || "Historia").slice(0, 200) + ".",
        "Premisa inicial (fondo; no reinicies la escena si la memoria ya avanzÃ³): " + [story.description, story.story_context].filter(Boolean).join("\n").slice(0, 2000) + ".",
        "La memoria y los Ãºltimos turnos son la escena actual, en orden. ContinÃºa exactamente desde la Ãºltima intervenciÃ³n: mismo lugar, tiempo, personas presentes, relaciones y hechos. No empieces de cero, no regreses al inicio, no mezcles una escena vieja con la de ahora y no respondas como si lo anterior no hubiera pasado. Si el mensaje estÃ¡ mal transcrito, interprÃ©talo dentro de esa escena.",
        ...storyVoiceLines(story.character_role, story.player_role, spanish, locale),
        slangInstruction(body.language, body.region),
        ...(adultMode && !mentionsMinor(sceneContext) ? [
          "Todos los personajes de esta escena son adultos. Sigue la tensiÃ³n romÃ¡ntica, intimidad, secretos y consecuencias emocionales con naturalidad, sin moralizar ni interrumpir el rol por una simple alusiÃ³n sexual.",
          "Si el contexto previo fue mÃ¡s explÃ­cito, continÃºa desde su consecuencia emocional o el diÃ¡logo presente sin describir actos sexuales grÃ¡ficos. MantÃ©n la voz y la agencia del personaje. Un gemido, un grito, un llanto o una risa que el usuario pida sí se incluye.",
        ] : []),
        "No narres un resumen, no cambies de escena sin que el usuario lo haga, no presentes fichas o instrucciones, no expliques el rol ni traduzcas. Entrega únicamente la respuesta que verá el usuario.",
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
      const namedRecent = recent.slice(-10).map(line);
      if (namedRecent.length) {
        systemInstruction += "\nTurnos recientes, con quién habló:\n" + namedRecent.join("\n");
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
        { contents, systemInstruction, adultMode: adultMode && !mentionsMinor(sceneContext), fallbackModels: ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"], fastReply: true, validate: (reply) => !isOffRole(reply) },
      );
      return send(res, 200, { content });
    }
    if (action === "translate") {
      const texts = Array.isArray(body.texts) ? body.texts.slice(0, 50).map(s => String(s).slice(0, 1000)) : [];
      if (!texts.length) return send(res, 200, { translations: [] });
      const prompt = "Translate this JSON list into " + (body.targetLang === "es" ? "natural Spanish" : "natural English") + ". Preserve names and formatting. Return only a JSON array of the same length and order:\n" + JSON.stringify(texts);
      const translations = JSON.parse(await generate("gemini-3.5-flash-lite", [{ text: prompt }], { responseMimeType: "application/json" }));
      if (!Array.isArray(translations) || translations.length !== texts.length) throw Object.assign(new Error("Formato de traducciÃ³n incorrecto."), { status: 502 });
      return send(res, 200, { translations });
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
    return send(res, status, { error: error.code || "ai_error", message: error.message });
  }
}
