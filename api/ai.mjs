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
async function generate(model, parts, settings = {}) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key || key === "[SENSITIVE]") throw Object.assign(new Error("Gemini no estÃ¡ configurado en Insomnia (Vercel)."), { status: 503, code: "gemini_not_configured" });
  const choices = model === "gemini-3.5-transcribe" ? [model] : [...new Set([model, "gemini-3.6-flash", "gemini-3.8-flash"])];
  let lastError;
  for (const candidate of choices) {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + candidate + ":generateContent", {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: settings }),
      signal: AbortSignal.timeout(40000),
    });
    const data = await response.json();
    if (!response.ok) {
      lastError = Object.assign(new Error(data?.error?.message || "Gemini no respondiÃ³."), { status: response.status });
      if (response.status === 429 || response.status === 503) continue;
      throw lastError;
    }
    const content = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("").trim();
    if (!content) throw Object.assign(new Error("Gemini no devolviÃ³ texto."), { status: 502 });
    return content;
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
      const history = Array.isArray(body.history) ? body.history.slice(-12) : [];
      const prompt = [
        "Interpreta al personaje " + String(story.character_role || "principal").slice(0, 200) + " de " + String(story.title || "Historia").slice(0, 200) + ".",
        "Premisa: " + String(story.description || "").slice(0, 2500) + ". El usuario interpreta a " + String(story.player_role || "protagonista").slice(0, 150) + ".",
        "Responde en " + (body.language === "es" ? "espaÃ±ol" : "inglÃ©s") + ", como personaje, en menos de 250 caracteres. Una acciÃ³n breve y diÃ¡logo natural. No decidas acciones por el usuario.",
        "ConversaciÃ³n: " + JSON.stringify(history.map(x => ({ role: x.role, text: String(x.content || "").slice(0, 600) }))),
        "Usuario: " + String(body.userMessage || "").slice(0, 1200),
      ].join("\n");
      return send(res, 200, { content: await generate("gemini-3.5-flash", [{ text: prompt }], { maxOutputTokens: 200, temperature: 0.8 }) });
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
      return send(res, 200, { content: await generate("gemini-3.5-flash", [{ text: prompt }], { maxOutputTokens: 2000 }) });
    }
    if (action === "generate-shorts-series") {
      const idea = String(body.premise || "").trim().slice(0, 1000);
      if (idea.length < 8) return send(res, 400, { error: "premise_too_short" });
      const count = Math.min(6, Math.max(1, Number(body.episodes) || 3));
      const prompt = "Crea una miniserie original y coherente de " + count + " episodios para un usuario que dio esta idea: " + idea + ". Idioma espaÃ±ol. Devuelve solo JSON: " + JSON.stringify({ title: "", logline: "", episodes: [{ number: 1, title: "", script: "Guion hablado breve, menos de 320 caracteres", video_prompt: "English description of vertical cinematic scene 9:16, 15 seconds, no captions" }] }) + ". Identidad, vestuario y voz consistentes. Cada episodio con acciones y ambiente distintos. Exactamente " + count + " episodios.";
      const raw = await generate("gemini-3.5-flash", [{ text: prompt }], { responseMimeType: "application/json", maxOutputTokens: 6000 });
      const parsed = JSON.parse(raw);
      if (!parsed.title || !Array.isArray(parsed.episodes) || parsed.episodes.length !== count) throw Object.assign(new Error("Miniserie incompleta; intenta otra vez."), { status: 502 });
      const token = String(req.headers.authorization).replace(/^Bearer\s+/i, "");
      const userClient = createClient(BASE, KEY, { auth: { persistSession: false }, global: { headers: { Authorization: "Bearer " + token } } });
      const { data: { user } } = await userClient.auth.getUser(token);
      const { data: series, error: seriesError } = await userClient.from("shorts_series").insert({
        title: String(parsed.title).slice(0, 120), premise: String(parsed.logline || idea).slice(0, 500),
        category: String(body.category || "romance").slice(0, 40), is_adult: !!body.isAdult, created_by: user.id,
        video_provider: "kineva", is_published: false,
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
      const raw = await generate("gemini-3.5-flash", [{ text: prompt }], { responseMimeType: "application/json", maxOutputTokens: 12000 });
      const novel = JSON.parse(raw);
      if (!Array.isArray(novel.chapters) || !novel.title) throw Object.assign(new Error("Proyecto incompleto; intenta otra vez."), { status: 502 });
      return send(res, 200, { novel });
    }
    return send(res, 404, { error: "feature_not_configured", message: "Esta funciÃ³n todavÃ­a no estÃ¡ conectada a Kineva." });
  } catch (error) {
    const status = Number(error.status) || 500;
    console.error("Insomnia AI", action, status, error.message);
    return send(res, status, { error: error.code || "ai_error", message: error.message });
  }
}
