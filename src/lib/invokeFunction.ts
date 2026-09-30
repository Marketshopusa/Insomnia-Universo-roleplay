import { supabase } from "@/integrations/supabase/client";

const wait = (milliseconds: number) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

function responseContext(error: unknown) {
  if (!error || typeof error !== "object" || !("context" in error)) return null;
  const context = (error as { context?: Response }).context;
  return context instanceof Response ? context : null;
}

type FunctionResult<T> = { data: T | null; error: ({ message: string; context: Response } | null) };
const ownAi = new Set(["story-chat", "translate", "speech-to-text", "generate-narrative", "generate-novel", "generate-shorts-series", "illustrate-scene"]);
async function callOwnAi<T>(name: string, body: unknown): Promise<FunctionResult<T>> {
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch(name === "illustrate-scene" ? "/api/illustrate" : "/api/ai", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: "Bearer " + session.access_token } : {}),
    },
    body: JSON.stringify({ action: name, body }),
  });
  const data = await response.json();
  return response.ok
    ? { data: data as T, error: null }
    : { data: data as T, error: { message: data.message || data.error || "La funciÃ³n no estÃ¡ disponible.", context: response } };
}

type ChatReply = { status?: string; jobId?: string; content?: string; error?: string; message?: string };
async function callAdultStoryChat<T>(body: unknown): Promise<FunctionResult<T>> {
  const fail = (message: string, status: number, code = "local_chat_unavailable"): FunctionResult<T> => ({
    data: { error: code, message } as T,
    error: { message, context: new Response(null, { status }) },
  });
  try {
    const created = await supabase.functions.invoke<ChatReply>("adult-story-chat", {
      body: { action: "create", adultMode: true, ...(body as object) },
    });
    if (created.error || !created.data?.jobId)
      return fail("Kineva local no pudo iniciar el chat. Comprueba que la PC estÃ© encendida.", 503);
    for (let attempt = 0; attempt < 45; attempt += 1) {
      await wait(2000);
      const result = await supabase.functions.invoke<ChatReply>("adult-story-chat", {
        body: { action: "status", jobId: created.data.jobId },
      });
      if (result.error) return fail("No se pudo consultar la respuesta de Kineva.", 503);
      if (result.data?.status === "completed" && result.data.content)
        return { data: { content: result.data.content } as T, error: null };
      if (result.data?.status === "failed")
        return fail(result.data.message || "La respuesta repitio la escena. Reintenta el turno.", 502, result.data.error || "local_chat_failed");
    }
    return fail("Kineva local tardÃ³ demasiado. Tu mensaje sigue disponible para reenviar.", 504);
  } catch {
    return fail("Kineva local no estÃ¡ disponible. Tu mensaje sigue disponible para reenviar.", 503);
  }
}

/** Retries only transient network, rate-limit, and server failures once. */
export async function invokeFunctionWithRetry<T>(name: string, body: unknown): Promise<FunctionResult<T>> {
  if (name === "story-chat" && (body as { adultMode?: boolean })?.adultMode === true)
    return callAdultStoryChat<T>(body);
  if (ownAi.has(name)) {
    // The server already tries a second Gemini model on overload or timeout.
    // Retrying the whole request doubles chat latency and translation traffic.
    return callOwnAi<T>(name, body);
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
