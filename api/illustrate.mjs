import { createClient } from "@supabase/supabase-js";
import { supabaseUrl, publishableKey } from "./config.mjs";

export const maxDuration = 120;
const allowedCoverPrefix = /^\/storage\/v1\/object\/public\/(story-covers|user-story-covers)\//;

async function coverPart(value) {
  if (!value) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.origin !== supabaseUrl || !allowedCoverPrefix.test(url.pathname)) return null;
  const response = await fetch(url, { signal: AbortSignal.timeout(9000) });
  const mimeType = response.headers.get("content-type")?.split(";")[0] || "";
  if (!response.ok || !["image/png", "image/jpeg", "image/webp"].includes(mimeType)) return null;
  const length = Number(response.headers.get("content-length"));
  if (length > 3_000_000) return null;
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 3_000_000) return null;
  return { inlineData: { mimeType, data: bytes.toString("base64") } };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  const jwt = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const { data, error } = jwt
    ? await createClient(supabaseUrl, publishableKey, { auth: { persistSession: false } }).auth.getUser(jwt)
    : { data: null, error: true };
  if (error || !data?.user) return res.status(401).json({ error: "login_required" });
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key || key === "[SENSITIVE]") return res.status(503).json({ error: "image_not_configured" });
  const body = req.body?.body || {};
  const focus = String(body.focusText || "").trim().slice(0, 1800);
  if (focus.length < 8) return res.status(400).json({ error: "scene_too_short" });
  const prompt = [
    "Create one vertical 3:4 cinematic photorealistic still image illustrating the CURRENT moment of this fictional story.",
    "Keep the characters' identities, clothing, relationships, location, and chronology consistent with the context.",
    "Show the action and arrangement from the latest moment. Do not restart the story or copy the cover's pose.",
    "Do not include text, speech bubbles, captions, watermarks, or a collage.",
    "Title: " + String(body.storyTitle || "").slice(0, 160),
    "Characters: " + String(body.characterRole || "").slice(0, 450),
    "Player role: " + String(body.playerRole || "").slice(0, 450),
    "Premise: " + String(body.storyDescription || "").slice(0, 900),
    "Recent scene context: " + String(body.sceneText || "").slice(-2400),
    "LATEST MOMENT TO ILLUSTRATE: " + focus,
  ].join("\n");
  try {
    const reference = await coverPart(body.coverImageUrl).catch(() => null);
    const parts = [{ text: prompt }];
    if (reference) parts.push({ text: "Use this cover only to keep the character's visible appearance consistent. The pose and setting must follow the latest scene." }, reference);
    let image;
    let lastStatus = 502;
    for (const model of ["gemini-3.1-flash-image", "gemini-3.1-flash-lite-image"]) {
      const upstream = await fetch("https://generativelanguage.googleapis.com/v1/models/" + model + ":generateContent", {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { responseModalities: ["IMAGE"] },
        }),
        signal: AbortSignal.timeout(105000),
      });
      const result = await upstream.json();
      if (!upstream.ok) {
        lastStatus = upstream.status;
        console.warn("Insomnia image provider", model, upstream.status, result.error?.status, String(result.error?.message || "").slice(0, 280));
        if ([429, 500, 502, 503].includes(upstream.status)) continue;
        break;
      }
      image = (result.candidates?.[0]?.content?.parts || []).map((part) => part.inlineData).find((part) => part?.data && part.mimeType?.startsWith("image/"));
      if (image) break;
      console.warn("Insomnia image empty", model, result.candidates?.[0]?.finishReason);
      lastStatus = 422;
      break;
    }
    if (!image) {
      return res.status(lastStatus === 429 ? 429 : lastStatus === 422 ? 422 : 502).json({
        error: lastStatus === 429 ? "rate_limited" : lastStatus === 422 ? "content_blocked" : "image_unavailable",
        message: lastStatus === 429 ? "Se alcanzÃ³ la cuota de imÃ¡genes Gemini." :
          lastStatus === 422 ? "No se pudo generar una imagen de esta escena." : "La generaciÃ³n de imÃ¡genes no estÃ¡ disponible.",
      });
    }
    if (image.data.length > 3_800_000) return res.status(502).json({ error: "image_too_large" });
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({ imageUrl: "data:" + image.mimeType + ";base64," + image.data });
  } catch (failure) {
    console.warn("Insomnia image failure", failure.name);
    return res.status(504).json({ error: "image_timeout", message: "La imagen tardÃ³ demasiado en generarse." });
  }
}
