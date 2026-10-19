import { supabase } from "@/integrations/supabase/client";

const wait = (milliseconds: number) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

function responseContext(error: unknown) {
  if (!error || typeof error !== "object" || !("context" in error)) return null;
  const context = (error as { context?: Response }).context;
  return context instanceof Response ? context : null;
}

type FunctionResult<T> = { data: T | null; error: ({ message: string; context: Response } | null) };
const ownAi = new Set(["story-chat", "translate", "speech-to-text", "generate-narrative", "generate-novel", "generate-studio-draft", "generate-shorts-series", "illustrate-scene"]);
async function callOwnAi<T>(name: string, body: unknown): Promise<FunctionResult<T>> {
  try {
    let { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      try {
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (refreshed?.session) session = refreshed.session;
      } catch { /* session unauthenticated */ }
    }
    const response = await fetch(name === "illustrate-scene" ? "/api/illustrate" : "/api/ai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: "Bearer " + session.access_token } : {}),
      },
      body: JSON.stringify({ action: name, body }),
    });
    const isOk = response.ok;
    let data: any = null;
    const text = await response.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text || "Respuesta no disponible del servidor." };
    }
    return isOk
      ? { data: data as T, error: null }
      : { data: data as T, error: { message: data?.message || data?.error || "La función no está disponible.", context: response } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error de conexión con el servicio de IA.";
    return { data: null, error: { message, context: new Response(null, { status: 503 }) } };
  }
}

import { compactRoleplayReply, isRepeatedAssistantReply, resolveActiveCharacter, sanitizeSwitchedReply } from "./roleReply";

async function callLocalLlama<T>(body: unknown): Promise<FunctionResult<T> | null> {
  try {
    if ((import.meta as any).env?.VITEST) return null;
    if (typeof window !== "undefined" && window.location.protocol === "https:") return null;
    const input = body as {
      story?: { title?: string; description?: string; story_context?: string; character_role?: string; player_role?: string };
      userMessage?: string;
      history?: { role: string; content: string }[];
      language?: string;
    };

    const characterName = input.story?.character_role || "Personaje";
    const playerName = input.story?.player_role || "Usuario";
    const historyList = input.history || [];
    const activeChar = resolveActiveCharacter(input.userMessage || "", historyList, characterName, playerName);
    const premise = [input.story?.description, input.story?.story_context].filter(Boolean).join(" ").slice(0, 600);
    const lastAssistant = [...historyList].reverse().find((m) => m.role === "assistant")?.content?.slice(0, 140) || "";
    const noRepeatRule = lastAssistant
      ? `\nPROHIBICIÓN ABSOLUTA DE REPETIR TU RESPUESTA ANTERIOR: En tu mensaje anterior ya dijiste "${lastAssistant}...". Está ESTRICTAMENTE PROHIBIDO repetir esas frases o usar el mismo inicio. Responde directamente a las nuevas palabras y confesiones de ${activeChar.playerFirstName}.`
      : "";

    const systemPrompt = (activeChar.isSwitched
      ? `Eres ${activeChar.fullLabel} en una escena adulta interactuando con ${activeChar.playerFirstName}.
REGLA SUPREMA DE IDENTIDAD Y COHERENCIA DE TRATO:
1. En este momento TÚ ERES EXCLUSIVAMENTE ${activeChar.fullLabel}. Hablas y actúas siempre en PRIMERA PERSONA como ${activeChar.name}.
2. Tu parentesco con ${activeChar.playerFirstName} es fijo: a ${activeChar.playerFirstName} SIEMPRE lo llamas "${activeChar.addressTerm}" o "${activeChar.playerFirstName}".
3. Si en la conversación se menciona a ${activeChar.defaultFirstName} diciendo que es hija o sobrina de ${activeChar.playerFirstName}, recuerda que ${activeChar.defaultFirstName} es tu hija (una tercera persona): TÚ sigues siendo ${activeChar.fullLabel}.
4. ESTRICTAMENTE PROHIBIDO llamar a ${activeChar.playerFirstName} "Papi", "Papá", "Tío", "Director" o "Usuario", y prohibido decir "Mami".
5. PROPORCIÓN 80% DIÁLOGO HABLADO / 20% ACCIÓN BREVE:
   - Abre con 1 sola acotación corta de 2 a 5 palabras entre asteriscos en PRIMERA PERSONA (ejemplo: *Me aprieto contra tu pecho*).
   - El 80% de tu respuesta DEBE ser diálogo hablado directo (2 a 3 oraciones completas, expresivas, calientes y naturales hablándole directamente a tu ${activeChar.addressTerm} ${activeChar.playerFirstName}, 35 a 60 palabras en total).
6. NUNCA hables ni actúes por ${activeChar.playerFirstName}.`
      : `Eres ${characterName} en una escena adulta interactuando con ${playerName}. ${premise ? "Contexto: " + premise : ""}
REGLAS ESTRICTAS E INQUEBRANTABLES:
1. IDIOMA: 100% español nativo.
2. PROPORCIÓN 80% DIÁLOGO HABLADO / 20% ACCIÓN BREVE:
   - ACCIÓN (*...*): MÁXIMO 1 o 2 acotaciones ultra-cortas de 2 a 5 palabras en PRIMERA PERSONA (ejemplo: *Jadeo arqueando mi espalda* o *Me muerdo el labio*). PROHIBIDO escribir oraciones largas en asteriscos y PROHIBIDO narrar en tercera persona.
   - DIÁLOGO HABLADO: El 80% de tu respuesta DEBE ser diálogo hablado directo en primera persona (2 a 3 oraciones seguidas, expresivas, calientes y naturales hablándole directamente a ${playerName}).
3. LONGITUD REDUCIDA AL 50% (RESPUESTA CORTA Y ÁGIL):
   - Escribe SOLO 1 párrafo corto (entre 35 y 60 palabras en total). Termina siempre con una oración completa.
   - Ejemplo del formato exacto: *Jadeo aferrándome a ti* ¡Ahh, sí, no pares! Me vuelve loca sentir cómo me tocas con tanta fuerza... sigue así, por favor, que estoy ardiendo por ti y quiero que me hagas tuya ahora mismo.
4. COHERENCIA Y OBEDIENCIA: Obedece toda acción o petición de ${playerName}. PROHIBIDO llamarlo "Director" o "Usuario". NUNCA hables ni actúes por ${playerName}.`) + noRepeatRule;

    const rawHistory = historyList.slice(-10);
    const seenAssistant = new Set<string>();
    const filteredHistory = rawHistory.filter((m) => {
      if (m.role !== "assistant") return true;
      if (activeChar.isSwitched && /\bmami\b/i.test(m.content)) return false;
      const key = m.content.trim().toLowerCase().slice(0, 60);
      if (seenAssistant.has(key)) return false;
      seenAssistant.add(key);
      return true;
    }).slice(activeChar.isSwitched ? -6 : -10);

    const userContent = activeChar.isSwitched
      ? `[Responde en primera persona como ${activeChar.fullLabel} hablándole a tu ${activeChar.addressTerm} ${activeChar.playerFirstName} con palabras 100% nuevas sobre lo que acaba de decirte]:\n${input.userMessage || ""}`
      : (input.userMessage || "");

    // Merge consecutive messages of the same role so llama-server Jinja template never throws HTTP 400
    const alternating: { role: "user" | "assistant"; content: string }[] = [];
    for (const m of filteredHistory) {
      const role = m.role === "assistant" ? "assistant" : "user";
      const text = role === "assistant" ? sanitizeSwitchedReply(compactRoleplayReply(m.content), activeChar) : m.content;
      if (!text) continue;
      if (alternating.length > 0 && alternating[alternating.length - 1].role === role) {
        alternating[alternating.length - 1].content += "\n" + text;
      } else {
        alternating.push({ role, content: text });
      }
    }
    if (alternating.length > 0 && alternating[alternating.length - 1].role === "user") {
      alternating[alternating.length - 1].content += "\n" + userContent;
    } else {
      alternating.push({ role: "user", content: userContent });
    }

    const messages = [
      { role: "system", content: systemPrompt },
      ...alternating,
    ];

    const res = await fetch("http://127.0.0.1:8788/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "magnum-v4-12b",
        messages,
        max_tokens: 145,
        temperature: 0.85,
        repeat_penalty: 1.18,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    let content = data?.choices?.[0]?.message?.content?.trim();
    if (content) {
      content = content.replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u30ff]/g, "").trim();
      content = sanitizeSwitchedReply(compactRoleplayReply(content), activeChar);
      if (!isRepeatedAssistantReply(content, historyList)) {
        return { data: { content } as T, error: null };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Retries only transient network, rate-limit, and server failures once. */
export async function invokeFunctionWithRetry<T>(name: string, body: unknown): Promise<FunctionResult<T>> {
  if (ownAi.has(name)) {
    const cloudResult = await callOwnAi<T>(name, body);
    if (cloudResult.data && !cloudResult.error) return cloudResult;
    if (name === "story-chat") {
      const local = await callLocalLlama<T>(body);
      if (local?.data) return local;
    }
    return cloudResult;
  }
  let result = await supabase.functions.invoke<T>(name, { body });
  if (!result.error) return result as FunctionResult<T>;
  const context = responseContext(result.error);
  const status = context?.status ?? null;
  if (status !== null && status !== 429 && status < 500) return result as FunctionResult<T>;
  const retryAfter = Number(context?.headers.get("retry-after"));
  await wait(Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 5000) : 900);
  result = await supabase.functions.invoke<T>(name, { body });
  return result as FunctionResult<T>;
}
