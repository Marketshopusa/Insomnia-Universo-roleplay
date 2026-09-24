import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const WORDS_PER_SHOT = 32;
const MAX_SHOTS = 12;
function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}
function splitSpokenScript(script: string): string[] {
  const words = script.trim().match(/\S+/gu) ?? [];
  const chunks: string[] = [];
  for (let index = 0; index < words.length; index += WORDS_PER_SHOT) {
    chunks.push(words.slice(index, index + WORDS_PER_SHOT).join(" "));
  }
  return chunks;
}
function latestTakes(rows: Array<Record<string, unknown>>) {
  const shots = new Map<number, Record<string, unknown>>();
  for (const row of rows) {
    const number = Number(row.shot);
    if (!shots.has(number) || Number(row.take) > Number(shots.get(number)!.take)) {
      shots.set(number, row);
    }
  }
  return [...shots.values()].sort((a, b) => Number(a.shot) - Number(b.shot));
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
    const { data: episode } = await userClient.from("shorts_episodes")
      .select("id,series_id,episode_number,title,script,video_prompt,video_url,status,kineva_shot_count,error_message")
      .eq("id", episodeId).maybeSingle();
    if (!episode) return reply({ error: "not_found" }, 404);
    const { data: series } = await userClient.from("shorts_series")
      .select("id,created_by,video_provider,kineva_bible,kineva_reference_image_path")
      .eq("id", episode.series_id).maybeSingle();
    if (!series || series.created_by !== auth.user.id || series.video_provider !== "kineva") {
      return reply({ error: "forbidden" }, 403);
    }
    const allowed = (Deno.env.get("KINEVA_ALLOWED_USER_IDS") ?? "").split(",")
      .map((id) => id.trim()).filter(Boolean);
    if (action !== "status" && !allowed.includes(auth.user.id)) {
      return reply({ error: "creator_not_enabled" }, 403);
    }
    const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: jobs, error: jobsError } = await service
      .from("kineva_render_jobs")
      .select("id,shot,take,status,prompt,output_path,error_message,created_at")
      .eq("episode_id", episodeId).order("created_at", { ascending: true });
    if (jobsError) throw jobsError;
    const current = latestTakes(jobs ?? []);
    const ready = current.filter((job) => job.status === "ready").length;
    if (action === "status") {
      if (!current.length) return reply({ status: "pending", ready: 0, total: 0 });
      const total = episode.kineva_shot_count ?? current.length;
      if (current.some((job) => job.status === "failed")) {
        return reply({ status: "failed", ready, total,
          path: episode.video_url, error: episode.error_message ??
          current.find((job) => job.status === "failed")?.error_message });
      }
      if (episode.status === "failed") {
        return reply({ status: "failed", ready, total, path: episode.video_url,
          error: episode.error_message ?? "assembly_failed" });
      }
      if (ready === total && episode.status === "ready") {
        return reply({ status: "completed", path: episode.video_url, ready, total });
      }
      if (episode.status === "assembling" || ready === total) {
        return reply({ status: "assembling", ready, total });
      }
      return reply({ status: current.some((job) => job.status === "running") ?
        "running" : "queued", ready, total });
    }
    if (current.some((job) => ["queued", "running"].includes(String(job.status))) ||
        episode.status === "assembling") {
      return reply({ status: episode.status === "assembling" ? "assembling" : "queued",
        ready, total: episode.kineva_shot_count ?? current.length });
    }
    if (action === "create" && episode.video_url && episode.status === "ready") {
      return reply({ status: "completed", path: episode.video_url });
    }
    if (action === "create" && episode.status === "failed" &&
        current.length && ready === current.length) {
      await service.from("shorts_episodes").update({ status: "generating",
        error_message: null }).eq("id", episode.id);
      return reply({ status: "assembling", ready, total: current.length });
    }
    if (action === "repair" && !episode.video_url) {
      return reply({ error: "no_previous_render" }, 409);
    }
    const ref = series.kineva_reference_image_path;
    if (typeof ref !== "string" ||
        !new RegExp("^" + auth.user.id + "/[0-9a-f-]{36}\\.(png|jpg|jpeg|webp)$", "i").test(ref)) {
      return reply({ error: "reference_image_required" }, 400);
    }
    const shotNumber = Number(shot);
    if (!Number.isInteger(shotNumber) || shotNumber < 1 ||
        shotNumber > (episode.kineva_shot_count ?? MAX_SHOTS)) {
      return reply({ error: "invalid_shot" }, 400);
    }
    let payload: Array<Record<string, unknown>> = [];
    if (action === "repair") {
      const previous = current.find((job) => Number(job.shot) === shotNumber);
      if (!previous) return reply({ error: "shot_not_found" }, 404);
      payload = [{
        episode_id: episode.id, owner_id: auth.user.id,
        project_name: "insomnia_" + episode.series_id.replaceAll("-", "").slice(0, 16),
        profile: "MINISERIES", prompt: previous.prompt, bible: series.kineva_bible ?? {},
        reference_image_path: ref, shot: shotNumber, take: Number(previous.take) + 1,
      }];
    } else if (current.length) {
      payload = current.filter((job) => job.status === "failed").map((job) => ({
        episode_id: episode.id, owner_id: auth.user.id,
        project_name: "insomnia_" + episode.series_id.replaceAll("-", "").slice(0, 16),
        profile: "MINISERIES", prompt: job.prompt, bible: series.kineva_bible ?? {},
        reference_image_path: ref, shot: job.shot, take: Number(job.take) + 1,
      }));
      if (!payload.length) return reply({ status: "assembling", ready,
        total: episode.kineva_shot_count ?? current.length });
    } else {
      const chunks = splitSpokenScript(String(episode.script ?? ""));
      if (!chunks.length || chunks.length > MAX_SHOTS) {
        return reply({ error: "script_length_out_of_range" }, 422);
      }
      const bible = JSON.stringify(series.kineva_bible ?? {}).slice(0, 12000);
      payload = chunks.map((dialogue, index) => ({
        episode_id: episode.id, owner_id: auth.user.id,
        project_name: "insomnia_" + episode.series_id.replaceAll("-", "").slice(0, 16),
        profile: "MINISERIES",
        prompt: [
          "Create a connected 9:16 cinematic shot. Maintain the same identity, wardrobe,",
          "setting and voice across the entire episode. One shot, one continuous take.",
          "Story bible: " + bible,
          "Episode " + episode.episode_number + ": " + episode.title,
          "Scene direction: " + String(episode.video_prompt ?? "").slice(0, 1800),
          "Shot " + (index + 1) + " of " + chunks.length + "; continue from the preceding shot.",
          "Exact spoken script for THIS shot only: " + dialogue,
          "No captions or text overlays. Do not speak text from other shots.",
        ].join("\n"),
        bible: series.kineva_bible ?? {}, reference_image_path: ref,
        shot: index + 1, take: 1,
      }));
    }
    const { error: insertError } = await service.from("kineva_render_jobs").insert(payload);
    if (insertError) throw insertError;
    const { error: updateError } = await service.from("shorts_episodes").update({
      status: "generating", error_message: null, job_id: "kineva:queued",
      kineva_shot_count: episode.kineva_shot_count ?? payload.length,
    }).eq("id", episode.id);
    if (updateError) throw updateError;
    return reply({ status: "queued", ready, total: episode.kineva_shot_count ?? payload.length });
  } catch (error) {
    console.error("kineva-video", error);
    return reply({ error: "kineva_job_error" }, 500);
  }
});