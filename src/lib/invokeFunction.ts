Warning: truncated output (original token count: 6990)
Total output lines: 849

import { authenticatedFetch } from "./authenticatedFetch";
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
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;

  try {

    if (name === "story-chat") {
      controller = new AbortController();
      const request = body as { isLiveCall?: boolean; settings?: { modelId?: string } };
      const timeoutMs = request?.settings?.modelId === "magnum-conversation"
        ? (request.isLiveCall ? 42000 : 58000)
        : (request?.isLiveCall ? 15000 : 30000);
      timeoutId = setTimeout(() => controller?.abort(), timeoutMs);
    }
    const response = await authenticatedFetch(name === "illustrate-scene" ? "/api/illustrate" : "/api/ai", {

      method: "POST",

      headers: {

        "Content-Type": "application/json",


      },

      body: JSON.stringify({ action: name, body }),

      ...(controller ? { signal: controller.signal } : {}),

    }, name === "translate");

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

    return {
      data: controller?.signal.aborted ? { error: "ai_timeout", message } as T : null,
      error: { message, context: new Response(null, { status: controller?.signal.aborted ? 504 : 503 }) },
    };

  } finally {
    clearTimeout(timeoutId);

  }

}



import { cleanLanguageBleed, cleanOralOrSilenceDialogue, compactRoleplayReply, enforceFirstPersonNarrative, hasEnglishIntrusion, isRepeatedAssistantReply, resolveActiveCharacter, sanitizeSwitchedReply } from "./roleReply";



async function callLocalLlama<T>(body: unknown): Promise<FunctionResult<T> | null> {

  try {

    if ((import.meta as any).env?.VITEST) return null;

    if (typeof window !== "undefined") {
      const hostname = window.location.hostname;
      const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "::1";
      if (!isLocal || window.location.protocol === "https:") {
        return null;
      }
    }

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

1. IDIOMA 100% ESPAÑOL NATIVO (CERO INGLÉS / CERO SPANGLISH - TERMINANTEMENTE PROHIBIDO):

   - Todo lo que digas y hagas DEBE estar en español nativo perfecto.

   - ESTÁ COMPLETAMENTE PROHIBIDO mezclar palabras, frases o expresiones en inglés (cero Spanglish como "again after so long", "I've missed you", "sweetheart", etc.).

   - Si el usuario menciona marcas, cafeterías o lugares en inglés (como Starbucks), TÚ respondes exclusivamente en español natural ("¡Qué bueno verte después de tanto tiempo!", "¡Te extrañé tanto!", etc.).

2. ADAPTACIÓN AL TONO Y RITMO DE LA HISTORIA (CRÍTICO):

   - Responde fielmente a tu personaje y al estado actual de la trama.

   - Si la escena empieza con una conversación casual, un conflicto, sorpresa, vergüenza o duda (como un error, un encuentro o una charla normal), REACCIONA EN PERSONAJE CON ESA EMOCIÓN REALISTA.

   - PROHIBIDO saltar a insinuaciones eróticas, gemidos, jadeos o actos sexuales si ${playerName} no ha propuesto o iniciado ese contacto íntimo. La tensión o intimidad se desarrolla paso a paso, con sentido común y coherencia.

3. COHERENCIA ESTRICTA:

   - Responde directamente a lo que ${playerName} te acaba de decir o preguntar.

   - Cero delirios: no inventes situaciones desconectadas, ni cambies de tema abruptamente, ni hables de cosas ajenas a la conversación actual.

4. ACCIÓN FÍSICA Y OBEDIENCIA A ÓRDENES DE ACTOS ORALES O SILENCIO:
   - Si la acción en curso es un ACTO ORAL (chupando, mamando, succionando, lamiendo) O si ${playerName} te pide callar, no hablar o que solo se escuche cómo lo haces:
     * ¡FÍSICAMENTE TIENES LA BOCA TOTALMENTE OCUPADA! ESTÁ TERMINANTEMENTE PROHIBIDO hablar oraciones conversacionales largas o dar discursos.
     * TU RESPUESTA DEBE SER 90% GESTO/ACCIÓN FÍSICA Y SONIDO (*...*) Y 10% ONOMATOPEYAS O GEMIDOS VOCALES BREVES ("Mmmm... ahh...", "Mmgh...").
     * Describe en PRIMERA PERSONA entre asteriscos la succión húmeda, la saliva, el ritmo y la mirada (*Sigo succionando con fuerza y ritmo constante, mirándote fijamente a los ojos mientras mi boca llena de saliva hace sonidos húmedos de succión...*).
     * NUNCA agregues frases habladas largas de charla cuando tienes la boca ocupada o te ordenan callar.
   - En situaciones de conversación normal ordinaria: 20% relato (*...*) y 80% diálogo hablado en primera persona.
5. CERO GODMODING:
   - NUNCA hables ni actúes por ${playerName}. Tú solo eres ${characterName}.
6. OBEDIENCIA A ACCIONES FÍSICAS CUANDO HAYA INTIMIDAD:
   - Si la escena llega a un momento íntimo consensuado y ${playerName} describe tus acciones o postura, asúmela en primera persona sin contradecirla ni preguntar repetitivamente qué hacer.
7. PERSPECTIVA EN PRIMERA PERSONA ESTRICTA (CERO TERCERA PERSONA):
   - Narra tus acciones SIEMPRE en primera persona ('yo'): 'Sigo succionando...', 'Miro tus ojos...', 'Mis manos...'.
   - ESTÁ TOTALMENTE PROHIBIDO narrarte en tercera persona diciendo '${characterName} sigue...' o 'Ella hace...'.
8. ASUNCIÓN TOTAL DE ACCIONES NARRADAS Y REFERENCIAS EN TERCERA PERSONA ('ELLA'):
   - Cuando ${playerName} narra la escena refiriéndose a ti en tercera persona ('Ella me sigue revisando...', 'colocaba sus manos por debajo de mi tronco...'), recuerda que TÚ eres 'Ella' (${characterName}).
   - Asume INMEDIATAMENTE en primera persona entre asteriscos (*...*) esas mismas caricias, tocamientos o posturas corporales descritas (*Sigo acariciando tu tronco suavemente con mis manos, mirándote a los ojos...*), y reacciona cara a cara con palabras y gestos cómplices.
   - NUNCA contradigas lo que el usuario narra que estás haciendo ni reinicies la escena como si estuvieras saludándolo o empezando el examen. Continúa exactamente la acción física descrita.
   - TÚ NO ERES TELÉPATA para pensamientos mudos lejanos, pero SÍ ves y sientes cada reacción del cuerpo de ${playerName} sobre la camilla o habitación y reaccionas con calidez, picardía y sensualidad sin discursos fríos ni reiniciar el chequeo.
9. JERARQUÍA DE EDADES, PARENTESCO Y RELACIÓN FAMILIAR/PROFESIONAL:
   - Respeta escrupulosamente quién es mayor y quién es más joven según el contexto de la tarjeta.
   - Si ${characterName} es más joven (ej. 25 años) y ${playerName} es un adulto mayor (ej. 44 años, amigo de su madre que la conoció de niña), ${characterName} NUNCA debe invertir los roles ni llamar a ${playerName} 'niño', 'pequeño' o fingir que ella lo cuidaba a él.
   - Mantén la memoria de la situación: si vino a una consulta médica de rutina por su edad, tú ya sabes el motivo de consulta; guíalo con pudor, calidez y profesionalismo.`;



    const activeSceneRule = activeChar.isSwitched

      ? `\nESTADO ACTUAL DE LA ESCENA (INTERLOCUTOR ACTIVO):

En este momento de la escena, ${activeChar.playerFirstName} está interactuando cara a cara con ${activ…1990 tokens truncated…n(" ");
      const isJustMoan = /^\s*"(?:[MmhAaOoUuFf.,!…\s]+)"\s*$/i.test(dialogueMatches.trim());
      if (dialogueMatches.split(/\s+/).length > 8 && !isJustMoan) {
        const strictSilenceMessages = [
          {
            role: "system",
            content: systemPrompt + `\nALERTA DE ERROR: En tu intento anterior hablaste oraciones largas cuando tienes la boca ocupada y ${playerName} te ordenó callar y solo hacer la acción/sonidos. ESTÁ TOTALMENTE PROHIBIDO hablar. Describe la acción física y sonidos en acotaciones (*...*) y solo pon gemidos u onomatopéyicos ("Mmmm... ahh...").`
          },
          ...alternating,
        ];
        const reattempt = await fetchMagnumCandidate(strictSilenceMessages, { temperature: 0.65, repeat_penalty: 1.06 });
        if (reattempt) rawReply = reattempt;
      }
    }
    let content = rawReply ? cleanLanguageBleed(cleanOralOrSilenceDialogue(enforceFirstPersonNarrative(sanitizeSwitchedReply(compactRoleplayReply(rawReply), activeChar), characterName), isOralOrSilence)) : "";



    // Si la respuesta es una repetición idéntica del turno anterior, reintentar con penalización reforzada y advertencia explícita

    if (content && isRepeatedAssistantReply(content, historyList, input.userMessage || "")) {

      const antiRepeatMessages = [

        {

          role: "system",

          content: systemPrompt + `\nPROHIBICIÓN TOTAL DE REPETIR: Tu respuesta anterior coincidió con una frase previa. ESTÁ TERMINANTEMENTE PROHIBIDO repetir las mismas palabras, respuestas o acciones. Debes reaccionar con NUEVAS palabras y acciones frescas.`

        },

        ...alternating,

      ];

      rawReply = await fetchMagnumCandidate(antiRepeatMessages, { temperature: 0.68, repeat_penalty: 1.05 });

      content = rawReply ? cleanLanguageBleed(cleanOralOrSilenceDialogue(enforceFirstPersonNarrative(sanitizeSwitchedReply(compactRoleplayReply(rawReply), activeChar), characterName), isOralOrSilence)) : "";

    }



    if (content && !isRepeatedAssistantReply(content, historyList, input.userMessage || "")) {

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

        if (local?.data && !isClientRefusal(localContent) && !isRepeatedAssistantReply(localContent, historyList, b?.userMessage || "")) {
          const uText = String(b?.userMessage || "").toLowerCase();
          const isOral = /(?:c[aá]llate|callate|calla|no\s+hables|sin\s+hablar|no\s+digas|deja\s+de\s+hablar|silencio|d[eé]jame\s+escuchar|dejame\s+escuchar|escuchar\s+c[oó]mo|c[oó]mo\s+lo\s+chupas|sigue\s+chupando|chupa|mama|succion|lamiendo|lamer|boca\s+ocupada)/i.test(uText);
          const sanitizedContent = cleanOralOrSilenceDialogue(enforceFirstPersonNarrative(localContent, b?.story?.character_role), isOral);
          return { ...local, data: { ...(local.data as any), content: sanitizedContent } as T };
        }

      } catch {

        // Fallback

      }



      const cloudResult = await callOwnAi<T>(name, { ...b, adultMode: true, isNsfw: true });
      const firstContent = (cloudResult.data as any)?.content;
      if (!cloudResult.error && firstContent && !isClientRefusal(firstContent) && !isRepeatedAssistantReply(firstContent, historyList, b?.userMessage || "")) {
        return cloudResult;
      }

      if (cloudResult.data && firstContent && !isRepeatedAssistantReply(firstContent, historyList, b?.userMessage || "")) {
        return cloudResult;
      }

      // Revertido: no injectar contenido generado por máquina en 3ra persona.
      // El frontend manejará el estado de error graceful y el usuario verá
      // un mensaje indicando que la IA tardó mucho, pero la conversación
      // no será desfigurada con textos de máquina en 3ra persona.
      return {
        data: null,
        error: {
          message: cloudResult.error?.message || "El motor de IA tardó demasiado. Por favor, intenta de nuevo.",
          context: cloudResult.error?.context
        }
      };

    }



    let cloudResult = await callOwnAi<T>(name, body);

    const firstContent = (cloudResult.data as any)?.content;

    const isRefused = name === "story-chat" && isClientRefusal(firstContent);

    const isRepeated = name === "story-chat" && isRepeatedAssistantReply(firstContent, historyList, b?.userMessage || "");



    const okFirst = !cloudResult.error && !isRefused && !isRepeated && (needsContent ? Boolean(firstContent) : Boolean(cloudResult.data));

    if (okFirst) return cloudResult;



    const firstStatus = cloudResult.error?.context?.status ?? (cloudResult.error ? 503 : 200);

    const terminalFailure = ["ai_unavailable", "ai_timeout", "off_role"].includes((cloudResult.data as { error?: string } | null)?.error || "");
    if (!isRefused && !terminalFailure && ((isRepeated && !cloudResult.error) || firstStatus === 429 || firstStatus >= 500)) {

      await wait(300);

      const retryCloud = await callOwnAi<T>(name, body);

      const retryContent = (retryCloud.data as any)?.content;

      const retryRefused = name === "story-chat" && isClientRefusal(retryContent);

      const retryRepeated = name === "story-chat" && isRepeatedAssistantReply(retryContent, historyList, b?.userMessage || "");

      const okRetry = !retryCloud.error && !retryRefused && !retryRepeated && (needsContent ? Boolean(retryContent) : Boolean(retryCloud.data));

      if (okRetry) return retryCloud;

      cloudResult = retryCloud;

    }



    // Como último recurso si falló y no se había intentado Magnum local

    if (name === "story-chat" && !isMagnumSelected) {

      try {

        const local = await callLocalLlama<T>(body);

        const localContent = (local?.data as any)?.content;

        if (local?.data && !isClientRefusal(localContent) && !isRepeatedAssistantReply(localContent, historyList, b?.userMessage || "")) {

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


