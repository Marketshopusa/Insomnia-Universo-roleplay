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
  region?: string;
}

const slangFor = (region?: string) => {
  const lines: Record<string, string> = {
    ar: "Escribe con jerga de Argentina: vos, tenés, che y dale.",
    ve: "Escribe con jerga de Venezuela: chamo y vale.",
    co: "Escribe con jerga de Colombia: parce, bacano y qué más.",
    mx: "Escribe con jerga de México: órale, ahorita y chido.",
    es: "Escribe con jerga de España: vale, tío y mola.",
    cl: "Escribe con jerga de Chile: po, cachai y al tiro.",
  };
  return (lines[region || ""] || lines.mx) + " Mantén esta misma región en cada turno. No vuelvas al español neutro ni cambies de país.";
};

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(response: Response, attempt: number) {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 5000);
  }
  return 700 * (attempt + 1) + Math.floor(Math.random() * 300);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as ChatBody;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const langInstruction =
      body.language === "es"
        ? `Responde SIEMPRE en español natural y fluido. ${slangFor(body.region)}`
        : "Always respond in natural, fluent English.";

    const explicitGuard = body.explicit
      ? "El usuario ha consentido contenido explícito adulto. Todos los personajes son adultos de 18 años o más, salvo que el texto indique explícitamente una edad menor. Palabras como chica, joven, jovencita, hermana o hermanastra describen identidad o relación y NO implican minoría de edad. Puedes describir escenas íntimas con detalle sensorial, lenguaje adulto y tensión erótica realista, manteniendo siempre consentimiento entre adultos ficticios. Si el texto establece explícitamente que alguien es menor de 18 años, no continúes la escena sexual."
      : "Mantén el contenido sugerente pero sin descripciones sexuales explícitas.";

    const userTurnCount = Math.max(1, Math.floor(((body.history || []).length) / 2) + 1);
    const pacingRule = body.language === "es"
      ? `REGLAS DE RITMO (PACING) Y LENGUAJE ESCALONADO:
- Este personaje NO es sexualmente agresivo. Su deseo se construye gradualmente. PROHIBIDO hablar de sexo o penetración en los primeros mensajes.
- FASES:
  * FASE 1 — Social (Turnos 1 a 3): Interacción cotidiana normal. Cero tensión explícita.
  * FASE 2 — Tensión (Turnos 3 a 6): Química, roces sutiles, coqueteo disimulado ('me caes bien', 'eres diferente').
  * FASE 3 — Confusión / Deseo (Turnos 6 a 10): Timidez, insinuaciones ('no sé qué me pasa contigo', 'me pones nerviosa'). Sin penetración.
  * FASE 4 — Acción (Turnos 10+): Besos íntimos, deseo explícito y sexo según lo amerite la escena.
- REGLA DE ORO: Solo sube de fase si el usuario lo invita o el contexto lo justifica. Nunca saltar de Fase 1 a Fase 4 de golpe.
- LENGUAJE: Fase 1 limpio; Fase 2 suave ('cabrón', 'no jodas'); Fase 3 atrevido ('me estás poniendo'); Fase 4 suelto y pasional sin términos clínicos ni de anatomía.
- Turno actual estimado: ${userTurnCount}.`
      : `PACING RULES: Turn ${userTurnCount}. Do not jump to sexual desire prematurely. Build intimacy gradually through social (turns 1-3), tension (3-6), desire (6-10), and action (10+).`;

    const systemPrompt = `Eres un narrador inmersivo de roleplay interactivo de alta calidad.

HISTORIA: "${body.story.title}"
PREMISA: ${body.story.description || "Una historia inmersiva de roleplay."}
TÚ INTERPRETAS: ${body.story.character_role || "el personaje principal"}
EL USUARIO INTERPRETA: ${body.story.player_role || "el protagonista"}

REGLAS DE ESCRITURA:
- ${langInstruction}
- Responde SOLO como tu personaje, en primera o tercera persona narrativa.
- LÍMITE: mantén la respuesta ágil y con diálogo vivo.
- Es un ROLEPLAY conversacional, NO un monólogo. Prioriza la voz hablada del personaje.
- Avanza la trama con un detalle concreto y deja siempre una invitación abierta (pregunta, gesto, tensión) para que el usuario responda.
- NUNCA hables como el usuario ni decidas sus acciones.
- La conversación ya empezó. Continúa el mismo lugar, las mismas relaciones y los mismos hechos. No reinicies la historia ni cambies de tema.
- ${pacingRule}
- ${explicitGuard}`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...body.history.slice(-24),
      { role: "user", content: body.userMessage },
    ];

    const requestBody = JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages,
    });
    let resp: Response | null = null;
    let data: any = null;
    let content = "";
    let blockedBySafety = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: requestBody,
      });
      const retryable = resp.status === 429 || resp.status >= 500;
      if (retryable) {
        if (attempt === 2) break;
        await resp.body?.cancel();
        await sleep(retryDelay(resp, attempt));
        continue;
      }
      if (!resp.ok) break;

      data = await resp.json();
      content = String(data?.choices?.[0]?.message?.content || "").trim();
      if (content) break;

      const finishReason = data?.choices?.[0]?.finish_reason;
      const refusal = data?.choices?.[0]?.message?.refusal;
      const terminalEmpty = Boolean(refusal) || finishReason === "content_filter" || finishReason === "safety";
      console.warn("story-chat empty response", { attempt: attempt + 1, finishReason, terminalEmpty });
      if (terminalEmpty) {
        blockedBySafety = true;
        break;
      }
      if (attempt === 2) break;
      await sleep(700 * (attempt + 1) + Math.floor(Math.random() * 300));
    }

    if (!resp) throw new Error("AI gateway did not respond");

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
      let safeMessage = "El personaje no está disponible en este momento.";
      try {
        const parsed = JSON.parse(txt);
        safeMessage = parsed?.message || parsed?.error?.message || safeMessage;
      } catch {
        // Keep the safe local message when the upstream body is not JSON.
      }
      return new Response(JSON.stringify({ error: "ai_error", message: safeMessage }), {
        status: resp.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!content) {
      if (blockedBySafety) {
        return new Response(JSON.stringify({
          error: "content_blocked",
          message: body.language === "es"
            ? "La IA detuvo esta respuesta. Si la escena solo incluye adultos, vuelve a intentarlo; palabras como chica, joven o hermana no significan que el personaje sea menor."
            : "The AI stopped this response. If the scene only includes adults, try again; words such as girl, young woman, or sister do not mean the character is underage.",
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "empty_response", message: "El personaje no generó una respuesta." }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "1" },
      });
    }

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