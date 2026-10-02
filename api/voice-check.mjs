import { isGeminiConfigured, synthesizeGemini } from "./geminiTts.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  if (req.headers["x-voice-check"] !== "insomnia-gemini-check") return res.status(404).json({ error: "not_found" });
  if (!isGeminiConfigured()) return res.status(503).json({ ok: false, error: "not_configured" });
  const started = Date.now();
  try {
    const result = await synthesizeGemini("Hola, chamo. Esta es una prueba con risa. [laughing]", "Aoede", "es", {
      region: "ve",
      performance: "amused",
    });
    if (result.status !== 200) {
      return res.status(result.status === 403 ? 403 : 502).json({
        ok: false,
        status: result.status,
        detail: String(result.detail || "").slice(0, 500),
        ms: Date.now() - started,
      });
    }
    return res.status(200).json({
      ok: true,
      bytes: result.pcm.length,
      seconds: Number((result.pcm.length / 2 / 24000).toFixed(2)),
      ms: Date.now() - started,
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      detail: String(error?.message || "error").slice(0, 300),
      ms: Date.now() - started,
    });
  }
}
