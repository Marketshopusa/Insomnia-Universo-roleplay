import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SAFETY_RULES = `REGLAS DE CONTENIDO (obligatorias):
- Todos los personajes son adultos de 25+ anios.
- Tono sensual, sugerente, con tension romantica y deseo insinuado.
- NUNCA describas actos sexuales explicitos, desnudos, genitales ni penetracion.
- La sensualidad se expresa con miradas, cercania, roces, respiracion, silencios y dialogo.
- Vestuario elegante: los personajes siempre estan vestidos.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const premise: string = (body.premise ?? "").toString().slice(0, 600);
    const isAdult: boolean = !!body.isAdult;
    const category: string = (body.category ?? "romance").toString();
    const language: string = (body.language ?? "es").toString();
    const episodeCount = Math.min(Math.max(Number(body.episodes ?? 3), 1), 6);

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [
          {
            role: "system",
            content: `Eres guionista de micro-series verticales tipo shorts, estilo romance sensual adulto (moderado, nunca explicito).
${SAFETY_RULES}
Responde SOLO JSON valido con esta forma:
{"title":"...","logline":"...","episodes":[{"number":1,"title":"...","script":"...","video_prompt":"..."}]}
- "script": narracion en ${language}, maximo 320 caracteres, con al menos una linea de dialogo entre comillas, terminando en un gancho.
- "video_prompt": prompt en INGLES para un modelo de video vertical 9:16 de 8 segundos. Describe encuadre, luz, movimiento de camara, vestuario elegante y emocion. Personajes adultos, vestidos, sin desnudez ni actos sexuales. Incluye el ambiente sonoro deseado.`,
          },
          {
            role: "user",
            content: `Premisa: ${premise}\nCategoria: ${category}\nIntensidad: ${isAdult ? "adulta moderada (tension alta, insinuacion, sin explicito)" : "romantica suave"}\nGenera exactamente ${episodeCount} episodios numerados y conectados entre si.`,
          },
        ],
      }),
    });

    if (!aiRes.ok) {
      const detail = await aiRes.text();
      return new Response(JSON.stringify({ error: "ai_error", detail }), {
        status: aiRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const raw: string = aiJson?.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("La IA no devolvio un guion valido");
    const parsed = JSON.parse(match[0]);

    const service = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: series, error: seriesError } = await service
      .from("shorts_series")
      .insert({
        title: parsed.title ?? "Serie sin titulo",
        premise: parsed.logline ?? premise,
        category,
        is_adult: isAdult,
        created_by: user.id,
      })
      .select()
      .single();
    if (seriesError) throw seriesError;

    const episodes = (parsed.episodes ?? []).slice(0, episodeCount).map((ep: any, i: number) => ({
      series_id: series.id,
      episode_number: Number(ep.number) || i + 1,
      title: (ep.title ?? `Episodio ${i + 1}`).toString().slice(0, 120),
      script: (ep.script ?? "").toString().slice(0, 400),
      video_prompt: (ep.video_prompt ?? "").toString().slice(0, 900),
      status: "pending",
    }));

    const { data: inserted, error: epError } = await service
      .from("shorts_episodes")
      .insert(episodes)
      .select();
    if (epError) throw epError;

    return new Response(JSON.stringify({ series, episodes: inserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-shorts-series error", e);
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
