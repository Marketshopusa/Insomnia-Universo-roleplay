import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const bucket = "kineva-adult-chat";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "private, no-store" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: auth, error: authError } = await userClient.auth.getUser();
  if (authError || !auth.user) return reply({ error: "unauthorized" }, 401);
  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const body = await req.json();
    if (body?.action === "status") {
      if (typeof body.jobId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.jobId))
        return reply({ error: "invalid_job" }, 400);
      const resultPath = `responses/${auth.user.id}/${body.jobId}.json`;
      const { data, error } = await service.storage.from(bucket).download(resultPath);
      if (error || !data) {
        const { data: pending } = await service.storage.from(bucket)
          .download(`jobs/${auth.user.id}/${body.jobId}.json`);
        if (!pending) return reply({ error: "job_not_found" }, 404);
        return reply({ status: "pending" });
      }
      const result = JSON.parse(await data.text());
      return reply(result);
    }
    if (body?.action !== "create" || body?.adultMode !== true)
      return reply({ error: "invalid_request" }, 400);
    const latest = String(body.userMessage ?? "").trim().slice(0, 1500);
    if (latest.length < 2) return reply({ error: "missing_message" }, 400);
    const story = body.story ?? {};
    const history = (Array.isArray(body.history) ? body.history.slice(-40) : [])
      .filter((item: unknown) => typeof item === "object" && item !== null)
      .map((item: { role?: string; content?: string }) => ({
        role: item.role === "assistant" ? "assistant" : "user",
        content: String(item.content ?? "").slice(0, 650),
      }));
    const { data: pending, error: listError } = await service.storage.from(bucket)
      .list(`jobs/${auth.user.id}`, { limit: 10 });
    if (listError) throw listError;
    if ((pending?.length ?? 0) >= 3)
      return reply({ error: "queue_full", message: "Ya tienes tres turnos en proceso." }, 429);
    const jobId = crypto.randomUUID();
    const requestPath = `jobs/${auth.user.id}/${jobId}.json`;
    const payload = {
      jobId, ownerId: auth.user.id, createdAt: new Date().toISOString(),
      language: body.language === "es" ? "es" : "en",
      story: {
        title: String(story.title ?? "").slice(0, 160),
        description: String(story.description ?? "").slice(0, 1200),
        character_role: String(story.character_role ?? "").slice(0, 160),
        player_role: String(story.player_role ?? "").slice(0, 160),
      }, history, userMessage: latest,
    };
    const { error } = await service.storage.from(bucket).upload(requestPath,
      new Blob([JSON.stringify(payload)], { type: "application/json" }),
      { contentType: "application/json", upsert: false });
    if (error) throw error;
    return reply({ status: "pending", jobId }, 202);
  } catch (error) {
    console.error("adult-story-chat", error);
    return reply({ error: "local_chat_unavailable" }, 500);
  }
});
