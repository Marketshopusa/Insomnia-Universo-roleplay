import { createClient } from "@supabase/supabase-js";
import { supabaseUrl, publishableKey } from "./config.mjs";

const voices = { "scarlett-hd": "Aoede", "luna-sweet": "Leda", "aria-calm": "Kore", "max-deep": "Charon", "leo-warm": "Puck" };
const models = ["gemini-3.1-flash-tts-preview", "gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
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
  for (const model of models) {
    try {
      const legacy = model === "gemini-3.1-flash-tts-preview";
      const speechText = legacy
        ? [
            "Lee en voz alta el texto completo, palabra por palabra, con voz cÃ¡lida y natural.",
            "Pronuncia tanto la narraciÃ³n como el diÃ¡logo; no omitas ninguna parte.",
            "TEXTO COMPLETO:\n" + text,
          ].join(" ")
        : text;
      const upstream = await fetch(
        legacy
          ? "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent"
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
                stream: false,
              }),
          signal: AbortSignal.timeout(35000),
        },
      );
      if (!upstream.ok) {
        lastStatus = upstream.status;
        quotaExceeded ||= upstream.status === 429;
        console.warn("Insomnia speech provider", model, upstream.status);
        if ([429, 500, 502, 503, 504].includes(upstream.status)) continue;
        break;
      }
      const result = await upstream.json();
      const audio = legacy
        ? (result.candidates?.[0]?.content?.parts || [])
            .map((part) => part.inlineData)
            .find((part) => part?.data && part.mimeType?.startsWith("audio/l16"))
        : (result.steps || [])
            .flatMap((step) => step.content || [])
            .filter((part) => part.type === "audio" && part.data && part.mime_type === "audio/l16")
            .at(-1);
      if (!audio?.data) {
        console.warn("Insomnia speech provider returned no audio", model);
        lastStatus = 502;
        continue;
      }
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.write("data: " + JSON.stringify({ type: "speech.audio.delta", audio: audio.data }) + "\n\n");
      res.write("data: " + JSON.stringify({ type: "speech.audio.done" }) + "\n\n");
      return res.end();
    } catch (failure) {
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
