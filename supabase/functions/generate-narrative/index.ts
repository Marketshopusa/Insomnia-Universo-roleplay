import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Body {
  story: {
    title: string;
    description?: string;
    character_role?: string;
    player_role?: string;
    story_type?: string;
  };
  language: "en" | "es";
  explicit?: boolean;
  chapters?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const lang =
      body.language === "es"
        ? "Escribe TODO en español neutro, natural y literario."
        : "Write everything in natural, literary English.";

    const explicit = body.explicit
      ? "Incluye escenas íntimas adultas explícitas con descripciones sensoriales detalladas, consentidas y entre adultos ficticios."
      : "Mantén el tono sensual y sugerente sin descripciones sexuales explícitas.";

    const chapters = Math.max(3, Math.min(body.chapters || 5, 10));

    const prompt = `Eres un escritor profesional de ficción inmersiva.

Escribe un RELATO COMPLETO basado en:
TÍTULO: "${body.story.title}"
PREMISA: ${body.story.description || ""}
PROTAGONISTA: ${body.story.player_role || "el lector"}
OTRO PERSONAJE PRINCIPAL: ${body.story.character_role || ""}

REGLAS:
- ${lang}
- ${explicit}
- Estructura el relato en ${chapters} capítulos cortos numerados (## Capítulo 1, ## Capítulo 2…).
- Cada capítulo: 3-5 párrafos densos, con diálogo entre comillas y descripciones sensoriales.
- Empieza con un breve preámbulo de 1 párrafo que sitúe al lector en la escena.
- Construye tensión, desarrollo y un cierre satisfactorio.
- Usa Markdown (negritas, cursivas, encabezados ##).
- Total objetivo: 800-1200 palabras.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (resp.status === 429) {
      return new Response(JSON.stringify({ error: "rate_limited" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (resp.status === 402) {
      return new Response(JSON.stringify({ error: "credits_exhausted" }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!resp.ok) {
      const txt = await resp.text();
      console.error("AI gateway error:", resp.status, txt);
      return new Response(JSON.stringify({ error: "ai_error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const content: string = data.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-narrative error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});