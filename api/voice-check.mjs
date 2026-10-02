import { getGeminiAccessToken, speechPieces, synthesizeGemini } from "./geminiTts.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST" || req.headers["x-voice-check"] !== "insomnia-gemini-check") {
    return res.status(404).json({ error: "not_found" });
  }
  const text = "Hola, chamo. Te cuento esto ya. Después sigue el resto de la frase para que no esperes el párrafo completo antes de oír la primera palabra.";
  const pieces = speechPieces(text);
  const started = Date.now();
  const token = await getGeminiAccessToken();
  const first = await synthesizeGemini(pieces[0], "Aoede", "es", {
    region: "ve",
    performance: "neutral",
    tokenProvider: async () => token,
  });
  if (first.status !== 200) {
    return res.status(502).json({ ok: false, ms: Date.now() - started, status: first.status, detail: String(first.detail || "").slice(0, 300) });
  }
  return res.status(200).json({
    ok: true,
    ms: Date.now() - started,
    seconds: Number((first.pcm.length / 2 / 24000).toFixed(2)),
    pieceChars: pieces[0].length,
    pieces: pieces.length,
  });
}
