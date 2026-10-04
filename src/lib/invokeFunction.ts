import { supabase } from "@/integrations/supabase/client";

const wait = (milliseconds: number) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

function responseContext(error: unknown) {
  if (!error || typeof error !== "object" || !("context" in error)) return null;
  const context = (error as { context?: Response }).context;
  return context instanceof Response ? context : null;
}

type FunctionResult<T> = { data: T | null; error: ({ message: string; context: Response } | null) };
type ChatReply = { status?: string; jobId?: string; content?: string; error?: string; message?: string };
type PendingChat = { jobId: string; signature: string; createdAt: number };

async function chatSignature(body: unknown): Promise<string> {
  const input = body as {
    story?: { title?: string; character_role?: string; player_role?: string };
    userMessage?: string;
    history?: { role: string; content: string }[];
  };
  const prior = (input.history || []).slice();
  if (prior.at(-1)?.role === "user" && prior.at(-1)?.content === input.userMessage) prior.pop();
  const data = new TextEncoder().encode(JSON.stringify([
    input.story?.title, input.story?.character_role, input.story?.player_role,
    prior.slice(-8), input.userMessage,
  ]));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function callAdultStoryChat<T>(body: unknown): Promise<FunctionResult<T>> {
  const fail = (message: string, status: number, code = "local_chat_unavailable"): FunctionResult<T> => ({
    data: { error: code, message } as T,
    error: { message, context: new Response(null, { status }) },
  });
  const { data: { session } } = await supabase.auth.getSession();
  const key = session?.user?.id ? "kineva-adult-pending:" + session.user.id : null;
  try {
    const signature = await chatSignature(body);
    let saved: PendingChat | null = null;
    try {
      saved = key ? JSON.parse(localStorage.getItem(key) || "null") as PendingChat | null : null;
    } catch { /* Browser storage may be unavailable. */ }
    let jobId = saved?.signature === signature && Date.now() - saved.createdAt < 24 * 60 * 60 * 1000
      ? saved.jobId : undefined;
    if (!jobId) {
      const created = await supabase.functions.invoke<ChatReply>("adult-story-chat", {
        body: { action: "create", adultMode: true, ...(body as object) },
      });
      if (created.error || !created.data?.jobId)
        return fail("No se pudo enviar el turno a tu modelo local. Tu mensaje sigue en el cuadro.", 503);
      jobId = created.data.jobId;
      try { if (key) localStorage.setItem(key, JSON.stringify({ jobId, signature, createdAt: Date.now() })); } catch { /* ignore */ }
    }
    let consecutiveErrors = 0;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await wait(consecutiveErrors ? 700 : attempt < 20 ? 250 : 1000);
      const result = await supabase.functions.invoke<ChatReply>("adult-story-chat", {
        body: { action: "status", jobId },
      });
      if (result.error) {
        consecutiveErrors += 1;
        if (consecutiveErrors >= 12)
          return fail("La respuesta sigue en proceso, pero se cortó la conexión. Reenvía el mismo mensaje para recuperarla.", 503, "chat_status_unavailable");
        continue;
      }
      consecutiveErrors = 0;
      if (result.data?.status === "completed" && result.data.content) {
        try { if (key) localStorage.removeItem(key); } catch { /* ignore */ }
        return { data: { content: result.data.content } as T, error: null };
      }
      if (result.data?.status === "failed") {
        try { if (key) localStorage.removeItem(key); } catch { /* ignore */ }
        return fail(result.data.message || "No se pudo completar la respuesta. Reintenta el turno.", 502, result.data.error || "local_chat_failed");
      }
      if (result.data?.error === "job_not_found") {
        try { if (key) localStorage.removeItem(key); } catch { /* ignore */ }
        return fail("Ese turno ya no está en la cola. Reenvía tu mensaje.", 404, "chat_job_expired");
      }
    }
    return fail("La respuesta sigue procesándose. Reenvía el mismo mensaje para recuperarla.", 504, "chat_status_unavailable");
  } catch {
    return fail("No se pudo contactar con tu modelo local. Tu mensaje sigue disponible para reenviar.", 503);
  }
}
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
