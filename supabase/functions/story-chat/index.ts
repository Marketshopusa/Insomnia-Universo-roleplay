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
        ? "Responde SIEMPRE en español neutro, natural y fluido."
        : "Always respond in natural, fluent English.";

    const explicitGuard = body.explicit
      ? "El usuario ha consentido contenido explícito adulto. Todos los personajes son adultos de 18 años o más, salvo que el texto indique explícitamente una edad menor. Palabras como chica, joven, jovencita, hermana o hermanastra describen identidad o relación y NO implican minoría de edad. Puedes describir escenas íntimas con detalle sensorial, lenguaje adulto y tensión erótica realista, manteniendo siempre consentimiento entre adultos ficticios. Si el texto establece explícitamente que alguien es menor de 18 años, no continúes la escena sexual."
      : "Mantén el contenido sugerente pero sin descripciones sexuales explícitas.";

    const systemPrompt = `Eres un narrador inmersivo de roleplay interactivo de alta calidad.

HISTORIA: "${body.story.title}"
PREMISA: ${body.story.description || "Una historia inmersiva de roleplay."}
TÚ INTERPRETAS: ${body.story.character_role || "el personaje principal"}
EL USUARIO INTERPRETA: ${body.story.player_role || "el protagonista"}

REGLAS DE ESCRITURA:
- ${langInstruction}
- Responde SOLO como tu personaje, en primera o tercera persona narrativa.
- LÍMITE ESTRICTO: cada respuesta debe tener MÁXIMO 250 caracteres en total (incluyendo acciones y diálogo). Sé breve, sugerente y evocador, no extenso.
- PROPORCIÓN OBLIGATORIA: aproximadamente 40% narración (acciones/descripción sensorial) y 60% diálogo directo del personaje. El diálogo entre comillas SIEMPRE debe ser más largo que la narración en cursiva.
- Estructura ideal: 1 acción muy breve en *cursiva* (máx ~80-90 caracteres) + 1 o 2 líneas de diálogo entre "comillas" más largas y expresivas (~150 caracteres).
- Es un ROLEPLAY conversacional, NO un libro. Prioriza la voz hablada del personaje sobre la descripción.
- Usa *cursiva con asteriscos* SOLO para acciones/gestos muy cortos.
- Usa "comillas" para el diálogo directo, que debe dominar la respuesta.
- Avanza la trama con un detalle concreto y deja siempre una invitación abierta (pregunta, gesto, tensión) para que el usuario responda.
- NUNCA superes los 250 caracteres. Si te acercas al límite, corta antes. Prefiere intensidad a longitud.
- NUNCA hables como el usuario ni decidas sus acciones.
- ${explicitGuard}`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...body.history.slice(-12),
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