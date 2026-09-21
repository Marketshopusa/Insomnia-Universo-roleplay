import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const NOVITA_API_KEY = Deno.env.get("NOVITA_API_KEY") ?? "";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const REALISTIC_MODEL = "realisticVisionV60B1_v60B1VAE_190174.safetensors";
const EXPLICIT_MODEL = "uberRealisticPornMerge_urpmv13.safetensors";
const BUCKET = "story-gallery";
const MAX_IMAGES = 8;
const BATCH = 4;
const WIDTH = 640;
const HEIGHT = 896;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NEGATIVE_PROMPT = [
  "lowres, blurry, low quality, watermark, text, signature",
  "bad anatomy, bad hands, bad fingers, extra fingers, missing fingers, fused fingers",
  "extra arms, extra legs, missing limbs, broken limbs, twisted limbs",
  "duplicated legs, three legs, three arms, detached limb, floating limb",
  "deformed, mutated, distorted face, asymmetrical face, fused bodies",
  "warped lips, melted lips, smeared mouth, bad teeth",
  "different person in every image, inconsistent face, face swap",
  "child, teen, underage, minor",
].join(", ");

const ANATOMY_GUARDS = [
  "professional realistic photo, physically possible human biomechanics",
  "each adult has exactly two arms, two legs, one head",
  "realistic hands, natural face, coherent anatomy",
].join(", ");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function describeCharacterFromCover(
  coverUrl: string,
  storyTitle: string,
  characterRole: string,
): Promise<string> {
  if (!LOVABLE_API_KEY) return "";
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Describe ONLY the main adult character's identity from this image for consistent image generation: face shape, eyes, hair color and style, skin tone, body type, age range (adult 25+). Under 70 words, plain descriptive English, no story or scene details.",
              },
              { type: "image_url", image_url: { url: coverUrl } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) return "";
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content?.trim();
    return typeof raw === "string" ? raw.slice(0, 400) : "";
  } catch (_e) {
    return "";
  }
}

async function designScenes(
  story: any,
  count: number,
  explicit: boolean,
  characterDesc: string,
): Promise<string[]> {
  const base = [
    `You design a photo gallery of the SAME recurring characters from an adult story, photographed in different circumstances.`,
    `Story title: ${story.title || ""}`,
    `Premise: ${story.description || ""}`,
    `Characters: ${story.character_role || ""} and ${story.player_role || "the reader"}.`,
    characterDesc ? `Fixed identity that must repeat in every image: ${characterDesc}` : "",
    explicit
      ? "The story is adult explicit: outfits and intimacy may escalate (elegant, casual, lingerie, bolder) always between adults 25+, tasteful and cinematic."
      : "Keep it sensual but non-explicit: elegant and casual outfits, tension and intimacy suggested, never nude.",
    `Each image is a different scenario: different location, different outfit, different pose and camera angle, consistent with the story premise.`,
    `Return valid JSON only, no explanations: {"scenes":[{"visualPrompt":"English prompt under 60 words, photorealistic, describing the person(s), outfit, location, pose and light"}]} with exactly ${count} scenes. All characters are adults 25+. Never minors.`,
  ]
    .filter(Boolean)
    .join("\n");

  if (!LOVABLE_API_KEY) return [];
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: base }],
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const parsed = JSON.parse(data?.choices?.[0]?.message?.content || "{}");
    const scenes = (parsed?.scenes || [])
      .map((s: { visualPrompt?: string }) => (s?.visualPrompt || "").toString().trim())
      .filter(Boolean)
      .slice(0, count);
    return scenes;
  } catch (_e) {
    return [];
  }
}

async function launchTask(
  prompt: string,
  initImageB64: string | null,
  explicit: boolean,
): Promise<string | null> {
  const request: Record<string, unknown> = {
    model_name: explicit ? EXPLICIT_MODEL : REALISTIC_MODEL,
    prompt: prompt.slice(0, 1024),
    negative_prompt: NEGATIVE_PROMPT.slice(0, 1024),
    width: WIDTH,
    height: HEIGHT,
    image_num: 1,
    steps: 30,
    seed: -1,
    clip_skip: 1,
    guidance_scale: 7.5,
    sampler_name: "DPM++ 2M Karras",
    restore_faces: true,
    hires_fix: {
      target_width: 768,
      target_height: 1072,
      strength: 0.35,
      upscaler: "RealESRNet_x4plus",
    },
  };

  // Prefer image-to-image from the story cover so the face stays consistent.
  if (initImageB64) {
    const res = await fetch("https://api.novita.ai/v3/async/img2img", {
      method: "POST",
      headers: { Authorization: `Bearer ${NOVITA_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        extra: { response_image_type: "jpeg" },
        request: { ...request, init_image: initImageB64 },
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.task_id) return data.task_id as string;
    } else {
      console.error("novita img2img failed", res.status, (await res.text()).slice(0, 400));
    }
  }

  const res = await fetch("https://api.novita.ai/v3/async/txt2img", {
    method: "POST",
    headers: { Authorization: `Bearer ${NOVITA_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ extra: { response_image_type: "jpeg" }, request }),
  });
  if (!res.ok) {
    console.error("novita txt2img failed", res.status, (await res.text()).slice(0, 400));
    return null;
  }
  const data = await res.json();
  return (data?.task_id as string) || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!NOVITA_API_KEY) return json({ error: "missing_key", detail: "NOVITA_API_KEY not configured" }, 500);

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const service = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json().catch(() => ({}));
    const action = (body?.action || "").toString();
    const storyId = (body?.storyId || "").toString().trim();
    if (!storyId) return json({ error: "invalid_input", detail: "storyId is required" }, 400);

    const { data: story } = await service.from("stories").select("*").eq("id", storyId).maybeSingle();
    if (!story) return json({ error: "not_found", detail: "Story not found" }, 404);

    const { data: existing } = await service
      .from("story_images")
      .select("*")
      .eq("story_id", storyId)
      .order("sort_order");
    const rows = existing || [];

    const syncCount = async () => {
      const ready = rows.filter((r: any) => r.status === "ready").length;
      await service.from("stories").update({ image_count: ready }).eq("id", storyId);
    };

    if (action === "status") {
      let changed = false;
      for (const row of rows) {
        if (row.status !== "pending" || !row.task_id) continue;
        try {
          const pollRes = await fetch(
            `https://api.novita.ai/v3/async/task-result?task_id=${encodeURIComponent(row.task_id)}`,
            { headers: { Authorization: `Bearer ${NOVITA_API_KEY}` } },
          );
          if (!pollRes.ok) continue;
          const pollData = await pollRes.json();
          const status = pollData?.task?.status;
          if (status === "TASK_STATUS_SUCCEED") {
            const url = (pollData?.images || [])[0]?.image_url;
            if (!url) {
              await service.from("story_images").update({ status: "failed", error_message: "empty_result" }).eq("id", row.id);
              changed = true;
              continue;
            }
            const imgRes = await fetch(url);
            if (!imgRes.ok) continue;
            const bytes = new Uint8Array(await imgRes.arrayBuffer());
            const path = `stories/${storyId}/${row.id}.jpg`;
            const { error: upErr } = await service.storage
              .from(BUCKET)
              .upload(path, bytes, { contentType: "image/jpeg", upsert: true });
            if (upErr) continue;
            await service
              .from("story_images")
              .update({ status: "ready", storage_path: path, error_message: null })
              .eq("id", row.id);
            row.status = "ready";
            row.storage_path = path;
            changed = true;
          } else if (status === "TASK_STATUS_FAILED") {
            await service
              .from("story_images")
              .update({ status: "failed", error_message: (pollData?.task?.reason || "failed").toString().slice(0, 300) })
              .eq("id", row.id);
            row.status = "failed";
            changed = true;
          }
        } catch (_e) {
          // keep polling next cycle
        }
      }
      if (changed) await syncCount();
      const { data: fresh } = await service
        .from("story_images")
        .select("id, status, storage_path, error_message, sort_order")
        .eq("story_id", storyId)
        .order("sort_order");
      const freshRows = fresh || [];
      return json({
        images: freshRows,
        done: freshRows.every((r: any) => r.status !== "pending"),
        count: freshRows.filter((r: any) => r.status === "ready").length,
      });
    }

    if (action === "start") {
      const readyRows = rows.filter((r: any) => r.status === "ready");
      const pendingRows = rows.filter((r: any) => r.status === "pending" && r.task_id);
      if (pendingRows.length > 0) return json({ status: "generating", pending: pendingRows.length });
      if (readyRows.length >= MAX_IMAGES) return json({ status: "full", count: readyRows.length });

      // Clean previous failures before retrying
      for (const row of rows) {
        if (row.status === "failed") {
          await service.from("story_images").delete().eq("id", row.id);
        }
      }

      const toGenerate = Math.min(BATCH, MAX_IMAGES - readyRows.length);
      const explicit = story.story_type === "real_sex" || !!story.has_explicit_images;

      // Identity reference from the cover (image covers only)
      const coverImage = (story.cover_image || "").toString();
      const isImageCover = !!coverImage && !/\.(mp4|webm|mov|m4v|ogv)(\?|$)/i.test(coverImage);
      let characterDesc = "";
      let initImageB64: string | null = null;
      if (isImageCover) {
        characterDesc = await describeCharacterFromCover(coverImage, story.title, story.character_role || "");
        try {
          const dl = await fetch(coverImage);
          if (dl.ok) {
            const buf = new Uint8Array(await dl.arrayBuffer());
            if (buf.byteLength < 8 * 1024 * 1024) {
              initImageB64 = btoa(String.fromCharCode(...buf));
            }
          }
        } catch (_e) {
          initImageB64 = null;
        }
      }

      const scenes = await designScenes(story, toGenerate, explicit, characterDesc);
      if (scenes.length === 0) {
        // Fallback: simple varied scenes derived from the premise
        const who = characterDesc || (story.character_role || "an adult character").toString();
        for (let i = 0; i < toGenerate; i++) {
          scenes.push(`${who}, photorealistic portrait in an intimate cinematic setting, natural light, adult 25+`);
        }
      }

      const baseSort = readyRows.length;
      let launched = 0;
      for (let i = 0; i < scenes.length; i++) {
        const visualPrompt = [
          scenes[i],
          characterDesc ? `IDENTITY (same person in every image): ${characterDesc}` : "",
          ANATOMY_GUARDS,
          explicit ? "adult explicit erotic content allowed, all characters adults 25+" : "sensual, non-explicit, adults 25+",
        ]
          .filter(Boolean)
          .join(", ");
        const taskId = await launchTask(visualPrompt, initImageB64, explicit);
        const { error: insErr } = await service.from("story_images").insert({
          story_id: storyId,
          visual_prompt: visualPrompt.slice(0, 1000),
          task_id: taskId,
          sort_order: baseSort + i,
          status: taskId ? "pending" : "failed",
          error_message: taskId ? null : "launch_failed",
        });
        if (!insErr) launched++;
      }

      await syncCount();
      return json({ started: true, launched });
    }

    if (action === "probe") {
      const probeBody = {
        extra: { response_image_type: "jpeg" },
        request: {
          model_name: REALISTIC_MODEL,
          prompt: "a red apple on a table",
          negative_prompt: "lowres",
          width: 512,
          height: 512,
          image_num: 1,
          steps: 10,
          seed: -1,
          guidance_scale: 7,
          sampler_name: "DPM++ 2M Karras",
        },
      };
      const endpoints = [
        "https://api.novita.ai/v3/async/txt2img",
        "https://api.novita.ai/async/txt2img",
        "https://api.novita.ai/v3/async/model-list",
      ];
      const results: any[] = [];
      for (const ep of endpoints) {
        try {
          const r = await fetch(ep, {
            method: "POST",
            headers: { Authorization: `Bearer ${NOVITA_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify(probeBody),
          });
          results.push({ ep, status: r.status, body: (await r.text()).slice(0, 300) });
        } catch (e) {
          results.push({ ep, error: String(e) });
        }
      }
      return json({ probe: results });
    }

    return json({ error: "invalid_action" }, 400);
  } catch (e) {
    console.error("story-gallery error", e);
    return json({ error: "server_error", detail: String(e) }, 500);
  }
});
