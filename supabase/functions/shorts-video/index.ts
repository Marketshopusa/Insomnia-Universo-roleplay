import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY = "https://ai.gateway.lovable.dev/v1/videos";

const SAFE_SUFFIX =
  "Cinematic vertical short, adults over 25, elegant clothing, tasteful and suggestive romance only. No nudity, no sexual acts, no explicit content, no minors. Soft warm lighting, shallow depth of field, single continuous shot.";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const service = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");
    const { action, episodeId } = await req.json();
    if (!episodeId) return json({ error: "episodeId requerido" }, 400);

    const { data: episode, error } = await service
      .from("shorts_episodes")
      .select("*")
      .eq("id", episodeId)
      .maybeSingle();
    if (error) throw error;
    if (!episode) return json({ error: "episodio no encontrado" }, 404);

    if (action === "create") {
      if (episode.video_url) return json({ status: "completed", path: episode.video_url });
      if (episode.status === "generating" && episode.job_id) {
        return json({ status: "generating", jobId: episode.job_id });
      }

      const prompt = `${episode.video_prompt || episode.script}. ${SAFE_SUFFIX}`;
      const res = await fetch(GATEWAY, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-omni-1.1-flash",
          input: prompt,
          response_format: { type: "video", resolution: "720p", duration: "8s", aspect_ratio: "9:16" },
        }),
      });

      if (!res.ok) {
        const detail = await res.text();
        await service
          .from("shorts_episodes")
          .update({ status: "failed", error_message: detail.slice(0, 500) })
          .eq("id", episodeId);
        return json({ error: "video_error", status: res.status, detail }, res.status);
      }

      const job = await res.json();
      await service
        .from("shorts_episodes")
        .update({ status: "generating", job_id: job.id, error_message: null })
        .eq("id", episodeId);
      return json({ status: "generating", jobId: job.id });
    }

    if (action === "status") {
      if (episode.video_url) return json({ status: "completed", path: episode.video_url });
      if (!episode.job_id) return json({ status: episode.status ?? "pending" });

      const res = await fetch(`${GATEWAY}/${episode.job_id}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const job = await res.json();

      if (job.status === "failed") {
        await service
          .from("shorts_episodes")
          .update({ status: "failed", error_message: job?.error?.message ?? "fallo la generacion" })
          .eq("id", episodeId);
        return json({ status: "failed", error: job?.error?.message ?? "fallo la generacion" });
      }

      if (job.status !== "completed") {
        return json({ status: "generating", progress: job.progress ?? 0 });
      }

      const contentRes = await fetch(`${GATEWAY}/${episode.job_id}/content`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const bytes = new Uint8Array(await contentRes.arrayBuffer());
      const path = `episodes/${episode.id}.mp4`;
      const { error: upErr } = await service.storage
        .from("shorts-media")
        .upload(path, bytes, { contentType: "video/mp4", upsert: true });
      if (upErr) throw upErr;

      await service
        .from("shorts_episodes")
        .update({ status: "ready", video_url: path, error_message: null })
        .eq("id", episodeId);

      return json({ status: "completed", path });
    }

    return json({ error: "accion invalida" }, 400);
  } catch (e) {
    console.error("shorts-video error", e);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
