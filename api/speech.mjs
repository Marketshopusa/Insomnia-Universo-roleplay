import { createClient } from "@supabase/supabase-js";
import { supabaseUrl, publishableKey } from "./config.mjs";

const voices = { "scarlett-hd": "Aoede", "luna-sweet": "Leda", "aria-calm": "Kore", "max-deep": "Charon", "leo-warm": "Puck" };
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
  const text = raw.replace(/[*_#]/g, "").replace(/\s+/g, " ").trim().slice(0, 1800);
  if (!text) return res.status(400).json({ error: "missing_text" });
  const voice = voices[req.body.voice] || "Kore";
  const payload = {
    model: "gemini-3.8-flash-lite-tts",
    input: [{ type: "user_input", content: [{ type: "text", text, annotations: [{ type: "speech_metadata", style: "Voz natural, cÃ¡lida y clara; ritmo conversacional" }] }] }],
    response_format: { type: "audio", mime_type: "audio/l16", sample_rate: 24000 },
    generation_config: { speech_config: [{ voice }] },
    stream: true,
  };
  try {
    const upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(55000),
    });
    if (!upstream.ok || !upstream.body) {
      const body = await upstream.json().catch(() => ({}));
      return res.status(upstream.status).json({ error: "tts_error", message: body?.error?.message || "La voz no estÃ¡ disponible." });
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.flushHeaders();
    const decoder = new TextDecoder();
    let buffer = "", audioSeen = false;
    for await (const value of upstream.body) {
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() || "";
      for (const event of events) {
        const line = event.split(/\r?\n/).filter(x => x.startsWith("data:")).map(x => x.slice(5).trim()).join("");
        if (!line || line === "[DONE]") continue;
        let parsed;
        try { parsed = JSON.parse(line); } catch { continue; }
        const delta = parsed.delta;
        if (parsed.event_type === "step.delta" && delta?.type === "audio" && delta.data) {
          res.write("data: " + JSON.stringify({ type: "speech.audio.delta", audio: delta.data }) + "\n\n");
          audioSeen = true;
        }
      }
    }
    if (!audioSeen) {
      res.write("data: " + JSON.stringify({ type: "speech.error", message: "Gemini no entregÃ³ audio" }) + "\n\n");
    } else {
      res.write("data: " + JSON.stringify({ type: "speech.audio.done" }) + "\n\n");
    }
    res.end();
  } catch (error) {
    console.error("Insomnia speech", error.message);
    if (res.headersSent) return res.end();
    return res.status(502).json({ error: "tts_error", message: "La voz no estÃ¡ disponible ahora." });
  }
}
