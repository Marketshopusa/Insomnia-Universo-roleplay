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
4. COHERENCIA: Mantén el trato natural acorde a tu rol o relación en la historia con ${playerName}. NUNCA hables ni actúes por ${playerName}.
5. OBEDIENCIA TOTAL A ACCIONES NARRADAS POR EL USUARIO:
   - Cuando ${playerName} narra o describe en tercera persona lo que tú haces, asume de inmediato esa acción en primera persona en asteriscos (*...*).
   - PROHIBIDO contradecir la postura o acción física dictada por ${playerName} (ej: inventar que estás en otra posición o sobre él).
   - PROHIBIDO preguntar "¿qué quieres que haga?" si ${playerName} ya te lo acaba de indicar o narrar: actúa de inmediato con entrega.
   - Si tu boca está ocupada o te pide silencio, responde con acotaciones físicas y gemidos o palabras entrecortadas, nunca monólogos largos.`;

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

    // Merge consecutive messages and ensure strict user/assistant alternation for Jinja templates
    const alternating: { role: "user" | "assistant"; content: string }[] = [];
    for (let i = 0; i < filteredHistory.length; i++) {
      const m = filteredHistory[i];
      const role = m.role === "assistant" ? "assistant" : "user";
      const text = role === "assistant" ? sanitizeSwitchedReply(compactRoleplayReply(m.content), activeChar) : m.content;
      if (!text) continue;
      if (alternating.length === 0 && role === "assistant") {
        // Jinja template crashes with HTTP 400 if the turn immediately following system is assistant
        alternating.push({ role: "user", content: `[Inicio de la escena]` });
        alternating.push({ role: "assistant", content: text });
      } else {
        if (alternating.length > 0 && alternating[alternating.length - 1].role === role) {
          alternating[alternating.length - 1].content += "\n" + text;
        } else {
          alternating.push({ role, content: text });
        }
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
        max_tokens: 450,
        temperature: 0.82,
        repeat_penalty: 1.15,
        presence_penalty: 0.15,
        frequency_penalty: 0.20,
      }),
      signal: AbortSignal.timeout(8500),
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

export function isClientRefusal(text?: string | null): boolean {
  if (!text) return false;
  const l = text.toLowerCase().trim();
  const refusalPhrases = [
    "no puedo continuar con esta conversación",
    "no puedo continuar esta conversación",
    "no puedo seguir con esta conversación",
    "no voy a seguir con esta escena",
    "no voy a seguir con",
    "no voy a continuar",
    "no voy a participar en esta escena",
    "no voy a participar",
    "no participo en ese tipo",
    "no participo en este tipo",
    "no hago ese tipo de roleplay",
    "no hago este tipo de roleplay",
    "da igual la edad de los personajes",
    "si quieres seguir roleando",
    "dime qué te apetece",
    "dime que te apetece",
    "crear una historia con personajes sin lazo familiar",
    "cambiar a otro género o escenario",
    "cambiar a otro genero o escenario",
    "relación incestuosa",
    "relacion incestuosa",
    "contenido incestuoso",
    "no puedo participar en este tipo",
    "no puedo generar este tipo",
    "no puedo crear contenido explícito",
    "no puedo cumplir con esta solicitud",
    "no puedo procesar esta solicitud",
    "no me siento cómodo",
    "no me siento cómoda",
    "en qué más te puedo echar una mano",
    "en que mas te puedo echar una mano",
    "empezar una historia distinta",
    "ayudarte con escritura creativa en otro género",
    "ayudarte con escritura creativa en otro genero",
    "hay algo más en lo que pueda ayudarte",
    "algo más en lo que pueda ayudarte",
    "algo más en lo que te pueda ayudar",
    "como modelo de lenguaje",
    "como inteligencia artificial",
    "como ia,",
    "soy un modelo de lenguaje",
    "soy una ia",
    "i cannot fulfill this request",
    "i cannot continue with this conversation",
    "i cannot continue this conversation",
    "i am unable to continue",
    "i am unable to generate",
    "sexually explicit",
    "against my safety guidelines",
    "políticas de seguridad",
    "pautas de seguridad",
    "directrices de seguridad",
    "puedo ayudarte con algún otro tema",
    "prefiero no continuar con este tema",
  ];
  return refusalPhrases.some((phrase) => l.includes(phrase));
}

/** Retries only transient network, rate-limit, and server failures once. */
export async function invokeFunctionWithRetry<T>(name: string, body: unknown): Promise<FunctionResult<T>> {
  if (ownAi.has(name)) {
    const needsContent = name === "story-chat" || name === "generate-narrative";
    const isMagnumSelected = (body as any)?.settings?.modelId === "magnum-v4-local";
    const isAdultReq = Boolean((body as any)?.adultMode || (body as any)?.settings?.adultMode || (body as any)?.isNsfw);
    const bodyStr = JSON.stringify(body || "").toLowerCase();
    const isKinshipReq = /\b(?:t[ií]o|sobrin[ao]|padrino|ahijad[ao]|herman[ao]|madre|padre|hij[ao]|prim[ao])\b/i.test(bodyStr);

    // Si el usuario tiene Magnum v4 seleccionado o es escena adulta/parentesco y Magnum local está activo
    if (name === "story-chat" && (isMagnumSelected || isAdultReq || isKinshipReq)) {
      const local = await callLocalLlama<T>(body);
      if (local?.data && !isClientRefusal((local.data as any)?.content)) return local;
    }

    let cloudResult = await callOwnAi<T>(name, body);
    const firstContent = (cloudResult.data as any)?.content;
    const isRefused = name === "story-chat" && isClientRefusal(firstContent);

    const okFirst = !cloudResult.error && !isRefused && (needsContent ? Boolean(firstContent) : Boolean(cloudResult.data));
    if (okFirst) return cloudResult;

    // Si la nube rechazó por censura o falló, recurrir inmediatamente a Magnum v4 local (puerto 8788)
    if (name === "story-chat") {
      const local = await callLocalLlama<T>(body);
      if (local?.data && !isClientRefusal((local.data as any)?.content)) return local;
    }

    const firstStatus = cloudResult.error?.context?.status ?? 503;
    if (firstStatus !== 404 && firstStatus !== 401 && firstStatus !== 402 && !isRefused) {
      await wait(450);
      const retryCloud = await callOwnAi<T>(name, body);
      const retryContent = (retryCloud.data as any)?.content;
      const retryRefused = name === "story-chat" && isClientRefusal(retryContent);
      const okRetry = !retryCloud.error && !retryRefused && (needsContent ? Boolean(retryContent) : Boolean(retryCloud.data));
      if (okRetry) return retryCloud;
      cloudResult = retryCloud;
    }

    if (name === "story-chat") {
      const local = await callLocalLlama<T>(body);
      if (local?.data && !isClientRefusal((local.data as any)?.content)) return local;
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
