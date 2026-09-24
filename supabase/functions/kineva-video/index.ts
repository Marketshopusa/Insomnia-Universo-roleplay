import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  const token = req.headers.get("Authorization") ?? "";
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: token } },
  });
  const { data: auth, error: authError } = await userClient.auth.getUser();
  if (authError || !auth.user) return reply({ error: "unauthorized" }, 401);

  try {
    const { action, episodeId, shot = 1 } = await req.json();
    if (!["create", "status", "repair"].includes(action) ||
        typeof episodeId !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(episodeId)) {
      return reply({ error: "invalid_request" }, 400);
    }
    const { data: episode, error } = await userClient
      .from("shorts_episodes")
      .select("id,series_id,episode_number,title,script,video_prompt,video_url")
      .eq("id", episodeId).maybeSingle();
    if (error || !episode) return reply({ error: "not_found" }, 404);
    const { data: series } = await userClient.from("shorts_series")
      .select("id,created_by,video_provider,kineva_bible,kineva_reference_image_path")
      .eq("id", episode.series_id).maybeSingle();
    if (!series || series.created_by !== auth.user.id ||
        series.video_provider !== "kineva") {
      return reply({ error: "forbidden" }, 403);
    }
    const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: recent, error: jobError } = await service
      .from("kineva_render_jobs")
      .select("id,status,take,shot,output_path,error_message,created_at")
      .eq("episode_id", episodeId)
      .order("created_at", { ascending: false }).limit(1);
    if (jobError) throw jobError;
    const current = recent?.[0];
    if (action === "status") {
      return reply(current
        ? { status: current.status === "ready" ? "completed" : current.status,
            jobId: current.id, path: current.output_path, error: current.error_message }
        : { status: "pending" });
    }
    if (current && ["queued", "running"].includes(current.status)) {
      return reply({ status: current.status, jobId: current.id });
    }
    if (action === "create" && episode.video_url) {
      return reply({ status: "completed", path: episode.video_url });
    }
    if (action === "repair" && !episode.video_url) {
      return reply({ error: "no_previous_render" }, 409);
    }
    if (!series.kineva_reference_image_path ||
        !new RegExp(`^${auth.user.id}/[0-9a-f-]{36}\\.(png|jpg|jpeg|webp)$`, "i").test(series.kineva_reference_image_path)) {
      return reply({ error: "reference_image_required" }, 400);
    }
    const shotNumber = Number(shot);
    if (!Number.isInteger(shotNumber) || shotNumber < 1 || shotNumber > 99) {
      return reply({ error: "invalid_shot" }, 400);
    }
    // The server copies the series bible and scene direction into an immutable job.
    // The worker never takes an executable ComfyUI graph from a browser request.
    const context = JSON.stringify(series.kineva_bible ?? {});
    const prompt = [
      "Create one 9:16 cinematic shot in a connected miniseries.",
      "Maintain the visual identity, clothing, setting and voice from the reference and series bible.",
      "Story bible: " + context.slice(0, 12000),
      "Episode " + episode.episode_number + ": " + episode.title,
      "Scene direction: " + (episode.video_prompt || "").slice(0, 2500),
      "Spoken script: " + (episode.script || "").slice(0, 2000),
      "Do not show captions or text overlays. Preserve exact spoken dialogue.",
    ].join("\n");
    const { data: job, error: insertError } = await service
      .from("kineva_render_jobs")
      .insert({
        episode_id: episode.id,
        owner_id: auth.user.id,
        project_name: "insomnia_" + episode.series_id.replaceAll("-", "").slice(0, 16),
        profile: "MINISERIES",
        prompt,
        bible: series.kineva_bible ?? {},
        reference_image_path: series.kineva_reference_image_path,
        shot: shotNumber,
        take: (current?.take ?? 0) + 1,
      }).select("id,status").single();
    if (insertError) throw insertError;
    if (!episode.video_url) {
      await service.from("shorts_episodes").update({
        status: "generating", job_id: "kineva:" + job.id, error_message: null,
      }).eq("id", episode.id);
    }
    return reply({ status: "queued", jobId: job.id });
  } catch (e) {
    console.error("kineva-video", e);
    return reply({ error: "kineva_job_error" }, 500);
  }
});