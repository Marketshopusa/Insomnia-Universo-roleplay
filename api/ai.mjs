import { createClient } from "@supabase/supabase-js";
import { supabaseUrl as BASE, publishableKey as KEY } from "./config.mjs";
const send = (res, status, value) => res.status(status).json(value);
async function authenticated(req) {
  const jwt = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!jwt || !KEY) return false;
  const client = createClient(BASE, KEY, { auth: { persistSession: false } });
  const { data, error } = await client.auth.getUser(jwt);
  return !error && !!data.user;
}
async function generate(model, parts, settings = {}, options = {}) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key || key === "[SENSITIVE]") throw Object.assign(new Error("Gemini no estÃ¡ configurado en Insomnia (Vercel)."), { status: 503, code: "gemini_not_configured" });
  const choices = model === "gemini-3.5-transcribe"
    ? [model]
    : [...new Set([model, ...(options.fallbackModels || ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"])])];
  let lastError;
  for (const candidate of choices) {
    try {
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + candidate + ":generateContent", {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: options.contents || [{ role: "user", parts }],
          ...(options.systemInstruction ? { systemInstruction: { parts: [{ text: options.systemInstruction }] } } : {}),
          ...(options.adultMode ? { safetySettings: [
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "OFF" },
          ] } : {}),
          generationConfig: candidate === "gemini-3.8-flash" && options.fastReply
            ? { ...settings, thinkingConfig: { thinkingLevel: "low" } }
            : settings,
        }),
        signal: AbortSignal.timeout(17000),
      });
      const data = await response.json();
      if (!response.ok) {
        console.warn("Insomnia AI upstream", candidate, response.status, data?.error?.status);
        lastError = Object.assign(new Error(data?.error?.message || "Gemini no respondiÃ³."), {
          status: response.status, code: response.status === 429 ? "rate_limited" : "ai_unavailable",
        });
        if ([404, 429, 500, 502, 503, 504].includes(response.status)) continue;
        throw lastError;
      }
      const blockReason = data.promptFeedback?.blockReason || (["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST"].includes(data.candidates?.[0]?.finishReason) ? data.candidates[0].finishReason : null);
      if (blockReason) {
        console.warn("Insomnia AI content blocked", candidate, blockReason);
        throw Object.assign(new Error(blockReason === "PROHIBITED_CONTENT"
          ? "Gemini rechazÃ³ esta escena por una restricciÃ³n propia del proveedor. El modo +18 no puede desactivar ese bloqueo."
          : "Gemini bloqueÃ³ esta escena. El mensaje permanece disponible para que puedas editarlo."), {
          status: 422, code: "content_blocked", blockReason,
        });
      }
      const content = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("").trim();
      if (!content) {
        console.warn("Insomnia AI empty output", candidate, "keys", Object.keys(data || {}), "feedback", data.promptFeedback?.blockReason, "candidateCount", data.candidates?.length, "finish", data.candidates?.[0]?.finishReason, "thoughts", data.usageMetadata?.thoughtsTokenCount);
        lastError = Object.assign(new Error("Gemini no devolviÃ³ texto."), { status: 502, code: "ai_unavailable" });
        continue;
      }
      if (options.validate && !options.validate(content)) {
        lastError = Object.assign(new Error("La respuesta saliÃ³ del personaje o cambiÃ³ de idioma."), { status: 502, code: "off_role" });
        console.warn("Insomnia AI rejected off-role output", candidate);
        continue;
      }
      return content;
    } catch (error) {
      if (error.name !== "TimeoutError") throw error;
      lastError = Object.assign(new Error("Gemini tardÃ³ demasiado en responder."), { status: 504, code: "ai_timeout" });
    }
  }
  throw lastError;
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
      const locale = spanish ? "espaÃ±ol" : "inglÃ©s";
      const isOffRole = (text) => {
        const reply = String(text || "").trim();
        if (!reply || reply.length > 360 || reply.split(/\n\s*\n/).length > 2) return true;
        if (/(respond as a character|under \d+ characters|brief action and natural dialogue|do not decide user actions|character .{0,80} currently|conversaci[oÃ³]n:|premise:|el usuario interpreta a|estÃ¡s interpretando a|language:|\bspanish\s*\.|\benglish\s*\.)/i.test(reply)) return true;
        if (spanish) {
          const english = (reply.match(/\b(the|this|that|with|and|your|you|she|he|her|him|friend|girlfriend|respond|character|scene|under|currently|feeling|something|said|sent)\b/gi) || []).length;
          const spanishWords = (reply.match(/\b(el|la|los|las|de|del|que|para|con|una|por|estoy|estÃ¡s|tÃº|yo|ella|aquÃ­|pero|porque|quiero|cÃ³mo|quÃ©)\b/gi) || []).length;
          if (english >= 3 && english > spanishWords * 1.4) return true;
        }
        return false;
      };
      const systemInstruction = [
        "Eres el personaje de una historia de rol en curso. Personaje o reparto: " + String(story.character_role || "personaje principal").slice(0, 200) + ".",
        "El usuario interpreta a " + String(story.player_role || "protagonista").slice(0, 150) + ". Historia: " + String(story.title || "Historia").slice(0, 200) + ".",
        "Premisa inicial (contexto de fondo, no reinicies la escena): " + String(story.description || "").slice(0, 2200) + ".",
        "Los Ãºltimos turnos son la escena actual. ContinÃºa exactamente desde la Ãºltima intervenciÃ³n: conserva lugar, tiempo, personajes presentes, relaciones y hechos establecidos. Los sucesos recientes prevalecen sobre la premisa inicial.",
        "Responde exclusivamente como el personaje presente, en " + locale + ". InteractÃºa con el usuario; una acciÃ³n breve y diÃ¡logo natural, mÃ¡ximo 250 caracteres. No controles ni decidas las acciones del usuario.",
        ...(adultMode ? [
          "Todos los personajes de esta escena son adultos. Sigue la tensiÃ³n romÃ¡ntica, intimidad, secretos y consecuencias emocionales con naturalidad, sin moralizar ni interrumpir el rol por una simple alusiÃ³n sexual.",
          "Si el contexto previo fue mÃ¡s explÃ­cito, continÃºa desde su consecuencia emocional o el diÃ¡logo presente sin describir actos sexuales grÃ¡ficos. MantÃ©n la voz y la agencia del personaje.",
        ] : []),
        "No narres un resumen, no cambies de escena sin que el usuario lo haga, no presentes fichas o instrucciones, no expliques el rol ni traduzcas. Entrega Ãºnicamente la respuesta que verÃ¡ el usuario.",
      ].join("\n");
      const prior = Array.isArray(body.history) ? body.history.slice(-16) : [];
      const contents = [];
      for (const entry of prior) {
        const role = entry?.role === "assistant" ? "model" : entry?.role === "user" ? "user" : null;
        const text = String(entry?.content || "").trim().slice(0, 650);
        if (!role || !text || (role === "model" && isOffRole(text))) continue;
        if (contents.at(-1)?.role === role) contents.at(-1).parts[0].text += "\n" + text;
        else contents.push({ role, parts: [{ text }] });
      }
      const latest = String(body.userMessage || "").trim().slice(0, 1200);
      if (!latest) return send(res, 400, { error: "missing_message" });
      if (contents.at(-1)?.role === "user") contents.at(-1).parts[0].text += "\n" + latest;
      else contents.push({ role: "user", parts: [{ text: latest }] });
      const content = await generate(
        adultMode ? "gemini-3.5-flash-lite" : "gemini-2.5-flash",
        [],
        { maxOutputTokens: 2048, temperature: 0.65 },
        { contents, systemInstruction, adultMode, fallbackModels: ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"], fastReply: true, validate: (reply) => !isOffRole(reply) },
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
      if (typeof body.audio !== "string" || body.audio.length < 2700 || body.audio.length > 12000000) return send(res, 400, { error: "invalid_audio" });
      const lang = body.language === "es" ? "es-ES" : body.language === "en" ? "en-US" : undefined;
      const opts = lang ? { audioTranscriptionConfig: { languageCodes: [lang] } } : {};
      const content = await generate("gemini-3.5-transcribe", [{ inlineData: { mimeType: body.mimeType || "audio/wav", data: body.audio } }], opts);
      return send(res, 200, { text: content });
    }
    if (action === "generate-narrative") {
      const story = body.story || {};
      const prompt = "Escribe una narraciÃ³n original en " + (body.language === "es" ? "espaÃ±ol" : "inglÃ©s") + " para " + String(story.title || "").slice(0, 250) + ". Premisa: " + String(story.description || "").slice(0, 2500) + ". Crea " + Math.min(5, Math.max(1, Number(body.chapters) || 3)) + " secciones breves con diÃ¡logos y continuidad.";
      return send(res, 200, { content: await generate("gemini-3.5-flash-lite", [{ text: prompt }], { maxOutputTokens: 2000 }) });
    }
    if (action === "generate-shorts-series") {
      const idea = String(body.premise || "").trim().slice(0, 1000);
      if (idea.length < 8) return send(res, 400, { error: "premise_too_short" });
      const count = Math.min(6, Math.max(1, Number(body.episodes) || 3));
      const prompt = "Crea una miniserie original y coherente de " + count + " episodios para un usuario que dio esta idea: " + idea + ". Idioma espaÃ±ol. Devuelve solo JSON: " + JSON.stringify({ title: "", logline: "", episodes: [{ number: 1, title: "", script: "Guion hablado breve, menos de 320 caracteres", video_prompt: "English description of vertical cinematic scene 9:16, 15 seconds, no captions" }] }) + ". Identidad, vestuario y voz consistentes. Cada episodio con acciones y ambiente distintos. Exactamente " + count + " episodios.";
      const raw = await generate("gemini-3.5-flash-lite", [{ text: prompt }], { responseMimeType: "application/json", maxOutputTokens: 6000 });
      const parsed = JSON.parse(raw);
      if (!parsed.title || !Array.isArray(parsed.episodes) || parsed.episodes.length !== count) throw Object.assign(new Error("Miniserie incompleta; intenta otra vez."), { status: 502 });
      const token = String(req.headers.authorization).replace(/^Bearer\s+/i, "");
      const userClient = createClient(BASE, KEY, { auth: { persistSession: false }, global: { headers: { Authorization: "Bearer " + token } } });
      const { data: { user } } = await userClient.auth.getUser(token);
      const referencePath = String(body.referencePath || "");
      if (!new RegExp("^" + user.id + "/[0-9a-f-]{36}\\.(png|jpg|jpeg|webp)$", "i").test(referencePath)) {
        return send(res, 400, { error: "reference_image_required" });
      }
      const { data: imageBlob, error: imageError } = await userClient.storage.from("kineva-references").download(referencePath);
      if (imageError || !imageBlob || imageBlob.size === 0) return send(res, 400, { error: "reference_image_unavailable" });
      const { data: series, error: seriesError } = await userClient.from("shorts_series").insert({
        title: String(parsed.title).slice(0, 120), premise: String(parsed.logline || idea).slice(0, 500),
        category: String(body.category || "romance").slice(0, 40), is_adult: !!body.isAdult, created_by: user.id,
        video_provider: "kineva", is_published: false,
        kineva_reference_image_path: referencePath, kineva_bible: { language: "Spanish" },
      }).select().single();
      if (seriesError) throw Object.assign(new Error(seriesError.message), { status: 500 });
      const rows = parsed.episodes.map((ep, i) => ({
        series_id: series.id, episode_number: i + 1, title: String(ep.title || "Episodio " + (i + 1)).slice(0, 120),
        script: String(ep.script || "").slice(0, 400), video_prompt: String(ep.video_prompt || "").slice(0, 900), status: "pending",
      }));
      const { data: episodes, error: episodeError } = await userClient.from("shorts_episodes").insert(rows).select();
      if (episodeError) throw Object.assign(new Error(episodeError.message), { status: 500 });
      return send(res, 200, { series, episodes });
    }
    if (action === "generate-novel") {
      const idea = String(body.description || "").trim().slice(0, 3500);
      if (idea.length < 10) return send(res, 400, { error: "description_too_short" });
      const count = Math.min(20, Math.max(3, Number(body.chapterCount) || 7));
      const prompt = "Eres guionista de miniseries. Crea " + count + " capÃ­tulos coherentes en " + String(body.language || "espaÃ±ol").slice(0, 40) + ". Devuelve solo JSON: " + JSON.stringify({ title: "", logline: "", characters: [{ name: "", age: "adulto", role: "", appearance: "", wardrobe: "", personality: "", voice: "", visual_prompt: "" }], setting: { place: "", time: "", visual_style: "" }, outline: "", chapters: [{ number: 1, title: "", summary: "", characters_present: [""], content: "capÃ­tulo con diÃ¡logos", video_prompt: "descripciÃ³n visual 9:16 sin subtÃ­tulos" }] }) + ". Conserva identidad y voces. Exactamente " + count + " capÃ­tulos. Idea: " + idea;
      const raw = await generate("gemini-3.5-flash-lite", [{ text: prompt }], { responseMimeType: "application/json", maxOutputTokens: 12000 });
      const novel = JSON.parse(raw);
      if (!Array.isArray(novel.chapters) || !novel.title) throw Object.assign(new Error("Proyecto incompleto; intenta otra vez."), { status: 502 });
      return send(res, 200, { novel });
    }
    return send(res, 404, { error: "feature_not_configured", message: "Esta funciÃ³n todavÃ­a no estÃ¡ conectada a Kineva." });
  } catch (error) {
    const status = Number(error.status) >= 400 && Number(error.status) <= 599 ? Number(error.status) : error.name === "TimeoutError" ? 504 : 500;
    console.error("Insomnia AI", action, status, error.message);
    return send(res, status, { error: error.code || "ai_error", message: error.message });
  }
}
