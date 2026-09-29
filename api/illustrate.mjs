import { createClient } from "@supabase/supabase-js";
import { supabaseUrl, publishableKey } from "./config.mjs";

const bucket = "kineva-scene-images";
const coverPrefix = /^\/storage\/v1\/object\/public\/(story-covers|user-story-covers)\//;
const send = (res, status, data) => res.status(status).json(data);

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
          .createSignedUrl(job.output_path, 3600);
        if (signedError) throw signedError;
        return send(res, 200, { status: "ready", imageUrl: signed.signedUrl });
      }
      return send(res, 200, { status: job.status,
        ...(job.status === "failed" ? { error: "render_failed", message: job.error_message || "La imagen no se pudo crear." } : {}) });
    }

    const focus = String(body.focusText || "").trim().slice(0, 1800);
    if (focus.length < 8) return send(res, 400, { error: "scene_too_short" });
    const source = body.source === "novel" ? "novel" : "story";
    const sceneKey = String(body.sceneKey || crypto.randomUUID()).slice(0, 120);
    const { data: prior, error: priorError } = await client.from("kineva_scene_jobs")
      .select("id,status,output_path").eq("owner_id", user.id).eq("source", source)
      .eq("scene_key", sceneKey).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (priorError) throw priorError;
    if (prior?.status === "ready" && prior.output_path) {
      const { data: signed, error: signedError } = await client.storage.from(bucket)
        .createSignedUrl(prior.output_path, 3600);
      if (signedError) throw signedError;
      return send(res, 200, { status: "ready", imageUrl: signed.signedUrl });
    }
    if (prior && ["queued", "running"].includes(prior.status))
      return send(res, 202, { jobId: prior.id, status: prior.status });
    const { count, error: countError } = await client.from("kineva_scene_jobs")
      .select("id", { count: "exact", head: true }).eq("owner_id", user.id).in("status", ["queued", "running"]);
    if (countError) throw countError;
    if ((count || 0) >= 3) return send(res, 429, { error: "queue_full", message: "Ya tienes tres imÃ¡genes en proceso." });
    const prompt = [
      "Create one vertical cinematic photorealistic still frame. Natural anatomy and lighting.",
      "The CURRENT action is the subject; preserve the established characters, wardrobe, location and chronology.",
      "No captions, speech bubbles, logos or collage.",
      "Story: " + String(body.storyTitle || "").slice(0, 160),
      "Character identity: " + String(body.characterRole || "").slice(0, 900),
      "Player role: " + String(body.playerRole || "").slice(0, 250),
      "Premise: " + String(body.storyDescription || "").slice(0, 650),
      "Recent context: " + String(body.sceneText || "").slice(-1900),
      "LATEST MOMENT: " + focus,
    ].join("\n");
    let referenceUrl = null;
    try {
      const url = new URL(body.coverImageUrl);
      if (url.origin === supabaseUrl && coverPrefix.test(url.pathname)) referenceUrl = url.toString();
    } catch { /* No public reference cover. */ }
    const { data: job, error } = await client.from("kineva_scene_jobs").insert({
      owner_id: user.id, source, scene_key: sceneKey,
      prompt, reference_url: referenceUrl,
    }).select("id,status").single();
    if (error) throw error;
    return send(res, 202, { jobId: job.id, status: job.status });
  } catch (failure) {
    console.error("Kineva scene queue", failure.message);
    return send(res, 500, { error: "scene_queue_unavailable", message: "No se pudo iniciar la ilustraciÃ³n." });
  }
}
