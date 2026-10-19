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
    const premise = [
      input.story?.title ? `Título: ${input.story.title}` : "",
      input.story?.description ? `Sinopsis: ${input.story.description}` : "",
      input.story?.story_context ? `Contexto: ${input.story.story_context}` : "",
    ].filter(Boolean).join("\n").slice(0, 1200);
    const lastAssistant = [...historyList].reverse().find((m) => m.role === "assistant")?.content?.slice(0, 140) || "";
    const noRepeatRule = lastAssistant
      ? `\nPROHIBICIÓN DE REPETIR TU RESPUESTA ANTERIOR: En tu turno anterior dijiste "${lastAssistant}...". No repitas esa respuesta; reacciona directamente a las nuevas palabras de ${activeChar.playerFirstName}.`
      : "";

    const baseSystemPrompt = `Eres un motor de roleplay interactivo con memoria narrativa y razonamiento lógico. Interpretas a ${characterName} interactuando con ${playerName}.
${premise ? `\nCONTEXTO DE LA HISTORIA:\n${premise}\n` : ""}
REGLAS DE RAZONAMIENTO Y FORMATO:
1. IDIOMA: 100% español nativo.
2. COMPRENSIÓN DE NARRACIÓN MIXTA: Cuando ${playerName} mezcle diálogo directo ("le digo...") con explicaciones en tercera persona sobre otro personaje, distingue claramente CON QUIÉN está hablando cara a cara vs. DE QUIÉN está hablando en tercera persona.
3. PROPORCIÓN EQUILIBRADA 20% RELATO / 80% DIÁLOGO HABLADO:
   - RELATO (*...*): El 20% de tu respuesta (1 oración descriptiva completa de 12 a 16 palabras en PRIMERA PERSONA entre asteriscos, o 2 acotaciones de 7 a 9 palabras cada una).
   - DIÁLOGO HABLADO: El 80% de tu respuesta (de 50 a 65 palabras, 2 a 3 oraciones completas en primera persona).
4. COHERENCIA: Mantén el trato natural acorde a tu rol o relación en la historia con ${playerName}. NUNCA hables ni actúes por ${playerName}.`;

    const activeSceneRule = activeChar.isSwitched
      ? `\nESTADO ACTUAL DE LA ESCENA (INTERLOCUTOR ACTIVO):
En este momento de la escena, ${activeChar.playerFirstName} está interactuando cara a cara con ${activeChar.fullLabel}.
- Responde en PRIMERA PERSONA como ${activeChar.fullLabel} (${activeChar.name}).
- Mantén coherencia con tu vínculo con ${activeChar.playerFirstName}${activeChar.addressTerm ? ` (trato natural: "${activeChar.addressTerm}" o "${activeChar.playerFirstName}")` : ""}.
- Si en la conversación se menciona a ${activeChar.defaultFirstName} en tercera persona, recuerda que ${activeChar.defaultFirstName} es otra persona de la historia y tú eres ${activeChar.fullLabel}.`
      : "";

    const systemPrompt = baseSystemPrompt + activeSceneRule + noRepeatRule;

    const rawHistory = historyList.slice(-16);
    const seenAssistant = new Set<string>();
    const filteredHistory = rawHistory.filter((m) => {
      if (m.role !== "assistant") return true;
      const key = m.content.trim().toLowerCase().slice(0, 60);
      if (seenAssistant.has(key)) return false;
      seenAssistant.add(key);
      return true;
    });

    const userContent = activeChar.isSwitched
      ? `[Escena actual: ${activeChar.playerFirstName} le habla directamente a ${activeChar.fullLabel}. Responde en primera persona como ${activeChar.name}]:\n${input.userMessage || ""}`
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
        max_tokens: 180,
        temperature: 0.85,
        repeat_penalty: 1.18,
      }),
      signal: AbortSignal.timeout(22000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    let content = data?.choices?.[0]?.message?.content?.trim();
    if (content) {
      content = content.replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u30ff]/g, "").trim();
      content = sanitizeSwitchedReply(compactRoleplayReply(content), activeChar);
      if (content) {
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
    const needsContent = name === "story-chat" || name === "generate-narrative";
    let cloudResult = await callOwnAi<T>(name, body);
    const okFirst = !cloudResult.error && (needsContent ? Boolean((cloudResult.data as any)?.content) : Boolean(cloudResult.data));
    if (okFirst) return cloudResult;

    const firstStatus = cloudResult.error?.context?.status ?? 503;
    if (firstStatus !== 404 && firstStatus !== 401 && firstStatus !== 402) {
      await wait(450);
      const retryCloud = await callOwnAi<T>(name, body);
      const okRetry = !retryCloud.error && (needsContent ? Boolean((retryCloud.data as any)?.content) : Boolean(retryCloud.data));
      if (okRetry) return retryCloud;
      cloudResult = retryCloud;
    }

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
