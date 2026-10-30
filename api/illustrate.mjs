import { createClient } from "@supabase/supabase-js";
import { supabaseUrl, publishableKey } from "./config.mjs";
import { isIpRateLimited, isHeavyJobRateLimited } from "./security/rateLimiter.mjs";
import { verifyAndDeductCredits, acquireConcurrencyLock, releaseConcurrencyLock } from "./security/creditGuard.mjs";
import { sanitizeUserPrompt, PROMPT_LIMITS } from "./security/promptShield.mjs";
import { applySyntheticMediaHeaders, SIGNED_URL_TTL_SECONDS } from "./security/biometricGuard.mjs";

const bucket = "kineva-scene-images";
const send = (res, status, data) => res.status(status).json(data);

export const maxDuration = 60;

export const NEGATIVE_SCENE_PROMPT = "(worst quality, low quality, bad anatomy, deformed limbs, extra limbs, extra hands, mutated fingers, duplicate bodies, distorted face, blurry, text, watermark, logo, morphing, malformed:1.3)";

export function visualTagsPrompt(body) {
  const charRole = String(body.characterRole || "").trim();
  const playerRole = String(body.playerRole || "").trim();
  const userText = String(body.userAction || "").replace(/[*_#]/g, " ").trim();
  const focus = String(body.focusText || "").replace(/[*_#]/g, " ").trim();
  const location = currentLocation(body.userAction) || currentLocation(body.recentVisualAction) || currentLocation(body.focusText) || "in a coherent room";
  
  const tags = [
    "(photorealistic:1.2, masterpiece, 8k, raw photo)",
    playerRole ? "two adults, 1man and 1woman" : "1person, solo",
    charRole ? `(${charRole.slice(0, 100)})` : "young beautiful woman",
    focus ? `(${focus.slice(0, 160)})` : "",
    userText ? `action: ${userText.slice(0, 100)}` : "",
    `setting: ${location}`,
    "cinematic lighting, shallow depth of field, sharp focus, coherent anatomy"
  ].filter(Boolean).join(", ");

  return tags;
}

export function sceneJobRow(userId, body) {
  const source = body.source === "novel" ? "novel" : "story";
  const sceneKey = String(body.sceneKey || "escena").trim().slice(0, 120) || "escena";
  const coverUrl = String(body.coverImageUrl || "").slice(0, 1200) || null;
  const fullPrompt = scenePrompt(body);
  const visualPrompt = visualTagsPrompt(body);
  const maxPeople = body.source === "story" && body.characterRole && body.playerRole ? 2 : null;
  let serialized = JSON.stringify({
    scene_prompt: fullPrompt,
    visual_prompt: visualPrompt,
    negative_prompt: NEGATIVE_SCENE_PROMPT,
    cover_url: coverUrl,
    max_people: maxPeople,
  });
  if (serialized.length > 7900) {
    const overflow = serialized.length - 7900;
    serialized = JSON.stringify({
      scene_prompt: fullPrompt.slice(0, Math.max(100, fullPrompt.length - overflow - 16)),
      visual_prompt: visualPrompt.slice(0, 300),
      negative_prompt: NEGATIVE_SCENE_PROMPT,
      cover_url: coverUrl,
      max_people: maxPeople,
    });
  }
  if (serialized.length < 8 || serialized.length > 8000) throw new Error("La escena excede el límite de ilustración.");
  return {
    owner_id: userId,
    source,
    scene_key: sceneKey,
    prompt: serialized,
    status: "queued",
  };
}

function visibleMoment(text) {
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  return compact.length <= 500 ? compact : compact.slice(0, 240).trimEnd() + " … " + compact.slice(-250).trimStart();
}

function currentLocation(text) {
  const words = String(text || "").toLowerCase();
  const places = [
    [/\b(?:veh[ií]culo|autom[oó]vil|carro|coche|taxi|camioneta)\b/g, "inside a vehicle"],
    [/\b(?:habitaci[oó]n|dormitorio|cama|bedroom|bed)\b/g, "in a bedroom"],
    [/\b(?:cocina|kitchen)\b/g, "in a kitchen"],
    [/\b(?:biblioteca|library)\b/g, "in a library"],
    [/\b(?:calle|street)\b/g, "on a street"],
  ];
  const matches = places.flatMap(([pattern, place]) => [...words.matchAll(pattern)].map((match) => ({ at: match.index, place })));
  return matches.sort((a, b) => b.at - a.at)[0]?.place || "";
}

export function scenePrompt(body) {
  const focus = String(body.focusText || "").trim()
    || String(body.userAction || "").trim()
    || String(body.recentVisualAction || "").trim()
    || String(body.storyDescription || body.storyTitle || "").trim()
    || "Un momento de la historia con sus personajes principales.";
  const actions = [...focus.matchAll(/\*([^*]{3,5000})\*/g)];
  const characterMoment = visibleMoment(actions.at(-1)?.[1]?.trim() || focus.split(/[.!?](?:\s|$)/, 1)[0]);
  const userText = String(body.userAction || "");
  const userActions = [...userText.matchAll(/\*([^*]{3,5000})\*/g)];
  const recentAction = String(body.recentVisualAction || "");
  const earlierActions = [...recentAction.matchAll(/\*([^*]{3,5000})\*/g)];
  const currentAction = userActions.at(-1)?.[1]?.trim() || (/\b(?:abro|abre|entra|camina|toma|sujeta|entrego|coloca|mira|se levanta|me levanto)\b/i.test(userText)
    ? userText.split(/[.!?](?:\s|$)/, 1)[0] : "");
  const userMoment = visibleMoment(currentAction || earlierActions.at(-1)?.[1]?.trim() || "");
  const location = currentLocation(userText) || currentLocation(recentAction) || currentLocation(focus);
  const setting = location || String(body.sceneText || "").replace(/\*[^*]*\*/g, " ").replace(/\s+/g, " ").trim().slice(-120);
  return [
    "One realistic vertical photograph of the current moment. Frame the described action in one coherent setting.",
    "Current setting cues only: " + setting + ". This current place overrides the background of Image 1; do not copy its room, furniture or previous scene.",
    "Show each described adult once in a distinct position. Only the participants in this moment; no bystanders, duplicate people or extra limbs.",
    "PLAYER visible action: " + (userMoment || "none described"),
    "CHARACTER visible reaction: " + characterMoment,
    "Main character: " + String(body.characterRole || "the main character").slice(0, 120),
    "Image 1 is an appearance reference for the main character only, not a scene or pose template. If two adults appear there, keep their faces on their own bodies.",
    "Other person only if present in this instant: " + String(body.playerRole || "").slice(0, 100),
    "Depict the specific visible action between the participants rather than substituting a different activity. Keep anatomy, contact, clothing and lighting coherent. No lettering, subtitles or panels.",
  ].join("\n");
}

export async function drawScene(prompt, options = {}) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key || key === "[SENSITIVE]") {
    throw Object.assign(new Error("Gemini no está configurado para ilustrar."), { status: 503, code: "gemini_not_configured" });
  }
  const fetchImpl = options.fetchImpl || fetch;
  const safetySettings = [
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
  ];
  const models = ["gemini-2.5-flash-image", "gemini-3.1-flash-image"];
  let allowSafety = true;
  let lastError = Object.assign(new Error("Gemini no pudo ilustrar la escena."), { status: 502, code: "scene_draw_failed" });
  const parts = [];
  if (options.coverImageUrl && typeof options.coverImageUrl === "string" && options.coverImageUrl.startsWith("http")) {
    try {
      const imgRes = await fetchImpl(options.coverImageUrl, { signal: AbortSignal.timeout(8000) });
      if (imgRes.ok) {
        const buffer = await imgRes.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        const contentType = imgRes.headers.get("content-type") || "image/jpeg";
        parts.push({
          inlineData: {
            mimeType: contentType.includes("png") ? "image/png" : contentType.includes("webp") ? "image/webp" : "image/jpeg",
            data: base64,
          },
        });
      }
    } catch {
      // Continue with text prompt if image fetch fails
    }
  }
  parts.push({ text: prompt });

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetchImpl("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: {
            responseModalities: ["IMAGE"],
            imageConfig: { aspectRatio: "3:4" },
          },
          ...(allowSafety ? { safetySettings } : {}),
        }),
        signal: AbortSignal.timeout(options.timeoutMs || 55000),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data?.error?.message || "Gemini no pudo ilustrar la escena.";
        lastError = Object.assign(new Error(message), { status: response.status, code: "scene_draw_failed" });
        if (response.status === 400 && allowSafety && /safety/i.test(message)) {
          allowSafety = false;
          continue;
        }
        if (response.status === 404) break;
        throw lastError;
      }
      const responseParts = data.candidates?.[0]?.content?.parts || [];
      const image = responseParts.map((part) => part.inlineData || part.inline_data).find((part) => part?.data);
      if (!image?.data) {
        throw Object.assign(new Error("Gemini no entregó la imagen de esta escena."), { status: 502, code: "scene_draw_empty" });
      }
      const mime = image.mimeType || image.mime_type || "image/png";
      return "data:" + mime + ";base64," + image.data;
    }
  }
  throw lastError;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" });
  const jwt = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return send(res, 401, { error: "login_required" });
  const client = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: "Bearer " + jwt } },
  });
  const { data: { user }, error: authError } = await client.auth.getUser(jwt);
  if (authError || !user) return send(res, 401, { error: "login_required" });
  res.setHeader("Cache-Control", "private, no-store");
  const body = req.body?.body || {};
  try {
    if (body.action === "status") {
      const id = String(body.jobId || "");
      if (!/^[0-9a-f-]{36}$/i.test(id)) return send(res, 400, { error: "invalid_job" });
      const { data: job, error } = await client.from("kineva_scene_jobs")
        .select("status,output_path,error_message").eq("id", id).eq("owner_id", user.id).maybeSingle();
      if (error) throw error;
      if (!job) return send(res, 404, { error: "job_not_found" });
      if (job.status === "ready") {
        const { data: signed, error: signedError } = await client.storage.from(bucket)
          .createSignedUrl(job.output_path, SIGNED_URL_TTL_SECONDS);
        if (signedError) throw signedError;
        return send(res, 200, { status: "ready", imageUrl: signed.signedUrl });
      }
      return send(res, 200, { status: job.status,
        ...(job.status === "failed" ? { error: "render_failed", message: job.error_message || "La imagen no se pudo crear." } : {}) });
    }

    // 1. Edge Rate Limiting
    const clientIp = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown";
    if (isIpRateLimited(clientIp, 30) || isHeavyJobRateLimited(user.id, 6)) {
      return send(res, 429, { error: "rate_limit_exceeded", message: "Demasiadas peticiones de ilustración. Espera un momento." });
    }

    // 2. Concurrency Lock
    const lock = acquireConcurrencyLock(user.id, "illustrate-scene");
    if (!lock.ok) {
      return send(res, 429, { error: lock.error, message: lock.message });
    }

    let lockId = lock.lockId;
    try {
      // 3. Atomic Pre-execution Credit Check & Deduction (HTTP 402)
      const creditRes = await verifyAndDeductCredits(client, user, "illustrate-scene");
      if (!creditRes.ok) {
        return send(res, creditRes.status || 402, {
          error: creditRes.error,
          message: creditRes.message,
          creditsRemaining: creditRes.creditsRemaining,
        });
      }

      // 4. Prompt Sanitization & Length Bound
      if (body.focusText) body.focusText = sanitizeUserPrompt(body.focusText, PROMPT_LIMITS.SCENE_ILLUSTRATE);
      if (body.userAction) body.userAction = sanitizeUserPrompt(body.userAction, PROMPT_LIMITS.SCENE_ILLUSTRATE);

      // 5. Apply Synthetic Media Provenance Headers
      applySyntheticMediaHeaders(res, { provenance: "Insomnia-Kineva-Scene" });

      if (body.engine === "comfy") {
      const row = sceneJobRow(user.id, body);
      const { data, error } = await client.from("kineva_scene_jobs").insert(row).select("id").single();
      if (error) throw Object.assign(new Error(error.message), { status: 500, code: "scene_queue_failed" });
      return send(res, 200, { status: "queued", jobId: data.id });
    }

    const prompt = scenePrompt(body);
    const imageUrl = await drawScene(prompt, { coverImageUrl: body.coverImageUrl });
    return send(res, 200, { status: "ready", imageUrl });
    } finally {
      if (lockId) releaseConcurrencyLock(user.id, lockId);
    }
  } catch (failure) {
    const status = Number(failure.status) >= 400 && Number(failure.status) <= 599 ? Number(failure.status) : 500;
    console.error("Scene illustration", status, failure.message);
    return send(res, status, { error: failure.code || "scene_draw_failed", message: failure.message || "No se pudo ilustrar la escena." });
  }
}
