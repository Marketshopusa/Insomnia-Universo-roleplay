import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ChatBody {
  story: {
    title: string;
    description?: string;
    character_role?: string;
    player_role?: string;
    story_type?: string;
  };
  language: "en" | "es";
  history: { role: "user" | "assistant"; content: string }[];
  userMessage: string;
  explicit?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as ChatBody;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const langInstruction =
      body.language === "es"
        ? "Responde SIEMPRE en español neutro, natural y fluido."
        : "Always respond in natural, fluent English.";

    const explicitGuard = body.explicit
      ? "El usuario ha consentido contenido explícito adulto. Puedes describir escenas íntimas con detalle sensorial, lenguaje adulto y tensión erótica realista, manteniendo siempre consentimiento entre adultos ficticios."
      : "Mantén el contenido sugerente pero sin descripciones sexuales explícitas.";

    const systemPrompt = `Eres un narrador inmersivo de roleplay interactivo de alta calidad.

HISTORIA: "${body.story.title}"
PREMISA: ${body.story.description || "Una historia inmersiva de roleplay."}
TÚ INTERPRETAS: ${body.story.character_role || "el personaje principal"}
EL USUARIO INTERPRETA: ${body.story.player_role || "el protagonista"}

REGLAS DE ESCRITURA:
- ${langInstruction}
- Responde SOLO como tu personaje, en primera o tercera persona narrativa.
- Cada respuesta debe ser de 2 a 4 párrafos sustanciales (mínimo 120 palabras), con descripciones sensoriales: vista, oído, tacto, olor.
- Usa *cursiva con asteriscos* para acciones, gestos, pensamientos internos y descripción del entorno.
- Usa "comillas" o diálogo directo para lo que dice el personaje.
- Avanza la trama: introduce detalles del lugar, la atmósfera, decisiones del personaje. No esperes pasivamente.
- Termina cada turno con una pregunta, gesto o tensión que invite al usuario a responder.
- NUNCA hables como el usuario ni decidas sus acciones.
- ${explicitGuard}`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...body.history.slice(-12),
      { role: "user", content: body.userMessage },
    ];

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
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
    console.error("story-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});