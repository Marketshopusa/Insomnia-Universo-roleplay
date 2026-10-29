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
    const input = body as {
      story?: { title?: string; description?: string; story_context?: string; character_role?: string; player_role?: string };
      userMessage?: string;
      history?: { role: string; content: string }[];
      language?: string;
    };

    const rawChar = input.story?.character_role || input.story?.title || "Personaje";
    const characterName = (rawChar.match(/[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}/)?.[0] || rawChar.split(/[\s,()]+/)[0] || "Personaje").trim();
    const rawPlayer = input.story?.player_role || "Usuario";
    const playerName = (rawPlayer.match(/[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}/)?.[0] || rawPlayer.split(/[\s,()]+/)[0] || "Usuario").trim();
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
2. ADAPTACIÓN AL TONO Y RITMO DE LA HISTORIA (CRÍTICO):
   - Responde fielmente a tu personaje y al estado actual de la trama.
   - Si la escena empieza con una conversación casual, un conflicto, sorpresa, vergüenza o duda (como un error, un encuentro o una charla normal), REACCIONA EN PERSONAJE CON ESA EMOCIÓN REALISTA.
   - PROHIBIDO saltar a insinuaciones eróticas, gemidos, jadeos o actos sexuales si ${playerName} no ha propuesto o iniciado ese contacto íntimo. La tensión o intimidad se desarrolla paso a paso, con sentido común y coherencia.
3. COHERENCIA ESTRICTA:
   - Responde directamente a lo que ${playerName} te acaba de decir o preguntar.
   - Cero delirios: no inventes situaciones desconectadas, ni cambies de tema abruptamente, ni hables de cosas ajenas a la conversación actual.
4. PROPORCIÓN EQUILIBRADA 20% RELATO / 80% DIÁLOGO HABLADO:
   - RELATO (*...*): El 20% de tu respuesta (1 o 2 acotaciones descriptivas breves en PRIMERA PERSONA entre asteriscos sobre tu gesto, expresión o movimiento inmediato).
   - DIÁLOGO HABLADO: El 80% de tu respuesta (diálogo directo, hablado en primera persona, interactuando con ${playerName}).
5. CERO GODMODING:
   - NUNCA hables ni actúes por ${playerName}. TÚ solo eres ${characterName}.
6. OBEDIENCIA A ACCIONES FÍSICAS CUANDO HAYA INTIMIDAD:
   - Si la escena llega a un momento íntimo consensuado y ${playerName} describe tus acciones o postura, asúmela en primera persona sin contradecirla ni preguntar repetitivamente qué hacer.`;

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
      const lastText = alternating[alternating.length - 1].content.trim().toLowerCase();
      if (!lastText.endsWith(userContent.trim().toLowerCase())) {
        alternating[alternating.length - 1].content += "\n" + userContent;
      }
    } else {
      alternating.push({ role: "user", content: userContent });
    }

    const messages = [
      { role: "system", content: systemPrompt },
      ...alternating,
    ];

    const fetchMagnumCandidate = async (
      chatMessages: { role: string; content: string }[],
      opts: { temperature?: number; repeat_penalty?: number; presence_penalty?: number } = {},
    ): Promise<string | null> => {
      const temperature = opts.temperature ?? 0.72;
      const repeat_penalty = opts.repeat_penalty ?? 1.06;
      const presence_penalty = 0.0;
      const frequency_penalty = 0.0;
      const repeat_last_n = 256;
      const max_tokens = 450;

      let res: Response | null = null;
      // 1. Intentar directamente llama-server en puerto 8788 (sin intermediarios de proxy)
      try {
        res = await fetch("http://127.0.0.1:8788/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "magnum-v4-12b",
            messages: chatMessages,
            max_tokens,
            temperature,
            repeat_penalty,
            presence_penalty,
            frequency_penalty,
            repeat_last_n,
          }),
          signal: AbortSignal.timeout(35000),
        });
      } catch {
        res = null;
      }

      // 2. Si 8788 no respondió directamente, intentar a través de local_creator en 8787
      if (!res || !res.ok) {
        try {
          res = await fetch("http://127.0.0.1:8787/chat", {
            method: "POST",
            mode: "cors",
            ...({ targetAddressSpace: "loopback" } as any),
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "magnum-v4-12b",
              messages: chatMessages,
              max_tokens,
              temperature,
              repeat_penalty,
              presence_penalty,
              frequency_penalty,
              repeat_last_n,
            }),
            signal: AbortSignal.timeout(35000),
          });
        } catch {
          return null;
        }
      }

      if (!res || !res.ok) return null;
      const data = await res.json().catch(() => null);
      let reply = data?.choices?.[0]?.message?.content?.trim();
      if (reply) {
        reply = reply.replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u30ff]/g, "").trim();
      }
      return reply || null;
    };

    // 1er intento de generación con penalización de repetición calibrada
    let rawReply = await fetchMagnumCandidate(messages, { temperature: 0.82, repeat_penalty: 1.25, presence_penalty: 0.5 });
    let content = rawReply ? sanitizeSwitchedReply(compactRoleplayReply(rawReply), activeChar) : "";

    // Si la respuesta es una repetición idéntica del turno anterior, reintentar con penalización reforzada y advertencia explícita
    if (content && isRepeatedAssistantReply(content, historyList)) {
      const antiRepeatMessages = [
        {
          role: "system",
          content: systemPrompt + `\nPROHIBICIÓN TOTAL DE REPETIR: Tu respuesta anterior coincidió con una frase previa. ESTÁ TERMINANTEMENTE PROHIBIDO repetir las mismas palabras, respuestas o acciones. Debes reaccionar con NUEVAS palabras y acciones frescas.`
        },
        ...alternating,
      ];
      rawReply = await fetchMagnumCandidate(antiRepeatMessages, { temperature: 0.78, repeat_penalty: 1.10 });
      content = rawReply ? sanitizeSwitchedReply(compactRoleplayReply(rawReply), activeChar) : "";
    }

    if (content && !isRepeatedAssistantReply(content, historyList)) {
      return { data: { content } as T, error: null };
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
    const b = body as any;
    const isAdultReq = Boolean(
      b?.adultMode ||
      b?.isAdult ||
      b?.isNsfw ||
      b?.story?.adult_mode ||
      b?.story?.nsfw ||
      b?.story?.story_type === "real_sex" ||
      b?.story?.has_explicit_images ||
      b?.story?.is_adult ||
      b?.settings?.adultMode ||
      b?.settings?.modelId === "magnum-v4-local"
    );
    const isMagnumSelected = isAdultReq || b?.settings?.modelId === "magnum-v4-local";
    const historyList = (b?.history || []) as any[];

    // Si el contenido es +18 / adulto o se configuro explicitamente Magnum v4 local, intentar primero servidor local
    if (name === "story-chat" && isMagnumSelected) {
      try {
        const local = await callLocalLlama<T>(body);
        const localContent = (local?.data as any)?.content;
        if (local?.data && !isClientRefusal(localContent) && !isRepeatedAssistantReply(localContent, historyList)) {
          return local;
        }
      } catch {
        // Fallback
      }

      // Reintento limpio en local si fallo por contencion momentanea de GPU
      try {
        await wait(500);
        const retryLocal = await callLocalLlama<T>(body);
        const retryLocalContent = (retryLocal?.data as any)?.content;
        if (retryLocal?.data && !isClientRefusal(retryLocalContent) && !isRepeatedAssistantReply(retryLocalContent, historyList)) {
          return retryLocal;
        }
      } catch {
        // Fallback a servidor sin censura
      }

      // En contenido adulto, JAMAS llamar a Gemini. Intentar exclusivamente a traves de callOwnAi (que usara OpenRouter uncensored)
      const cloudResult = await callOwnAi<T>(name, { ...b, adultMode: true, isNsfw: true });
      const firstContent = (cloudResult.data as any)?.content;
      if (!cloudResult.error && firstContent && !isClientRefusal(firstContent) && !isRepeatedAssistantReply(firstContent, historyList)) {
        return cloudResult;
      }

      // Si todo fallo en modo adulto, devolver un error claro de motor ocupado sin tocar Gemini jamas
      return {
        data: null,
        error: {
          message: "El motor de contenido adulto (Magnum v4) esta ocupado en la GPU. Intentalo de nuevo en unos segundos.",
          context: new Response(null, { status: 503 })
        }
      };
    }

    let cloudResult = await callOwnAi<T>(name, body);
    const firstContent = (cloudResult.data as any)?.content;
    const isRefused = name === "story-chat" && isClientRefusal(firstContent);
    const isRepeated = name === "story-chat" && isRepeatedAssistantReply(firstContent, historyList);

    const okFirst = !cloudResult.error && !isRefused && !isRepeated && (needsContent ? Boolean(firstContent) : Boolean(cloudResult.data));
    if (okFirst) return cloudResult;

    const firstStatus = cloudResult.error?.context?.status ?? 503;
    if (firstStatus !== 404 && firstStatus !== 401 && firstStatus !== 402 && !isRefused) {
      await wait(300);
      const retryCloud = await callOwnAi<T>(name, body);
      const retryContent = (retryCloud.data as any)?.content;
      const retryRefused = name === "story-chat" && isClientRefusal(retryContent);
      const retryRepeated = name === "story-chat" && isRepeatedAssistantReply(retryContent, historyList);
      const okRetry = !retryCloud.error && !retryRefused && !retryRepeated && (needsContent ? Boolean(retryContent) : Boolean(retryCloud.data));
      if (okRetry) return retryCloud;
      cloudResult = retryCloud;
    }

    // Como último recurso si falló y no se había intentado Magnum local
    if (name === "story-chat" && !isMagnumSelected) {
      try {
        const local = await callLocalLlama<T>(body);
        const localContent = (local?.data as any)?.content;
        if (local?.data && !isClientRefusal(localContent) && !isRepeatedAssistantReply(localContent, historyList)) {
          return local;
        }
      } catch {
        // N/A
      }
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
