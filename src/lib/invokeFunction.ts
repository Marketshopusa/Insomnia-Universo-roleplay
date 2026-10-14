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

// Supabase returns data=null for non-2xx responses; the server's error is in context.
async function chatErrorReply(error: unknown, data: ChatReply | null): Promise<ChatReply | null> {
  if (data) return data;
  const response = responseContext(error);
  if (!response) return null;
  try {
    const parsed: unknown = await response.clone().json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const value = parsed as Record<string, unknown>;
    return {
      ...(typeof value.error === "string" ? { error: value.error } : {}),
      ...(typeof value.message === "string" ? { message: value.message } : {}),
    };
  } catch { return null; }
}

async function chatSignature(body: unknown): Promise<string> {
  const input = body as {
    story?: { id?: string; title?: string; description?: string; story_context?: string; character_role?: string; player_role?: string };
    userMessage?: string; adultMode?: boolean;
    currentMessageId?: string; sessionId?: string; language?: string; region?: string;
    history?: { role: string; content: string }[];
    memory?: { role: string; content: string }[];
  };
  const prior = (input.history || []).slice();
  if (prior.at(-1)?.role === "user" && prior.at(-1)?.content === input.userMessage) prior.pop();
  const data = new TextEncoder().encode(JSON.stringify([
    input.story?.id, input.story?.title, input.story?.description,
    input.story?.story_context, input.story?.character_role, input.story?.player_role,
    input.sessionId, input.currentMessageId, input.language, input.region, input.adultMode === true,
    input.memory, prior.slice(-8), input.userMessage,
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
  const storyId = (body as { story?: { id?: string } })?.story?.id;
  const key = session?.user?.id
    ? "kineva-adult-pending:" + session.user.id + ":" + (storyId || "unknown")
    : null;
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
        body: { action: "create", adultMode: false, ...(body as object) },
      });
      if (created.error || !created.data?.jobId) {
        const details = await chatErrorReply(created.error, created.data);
        const status = responseContext(created.error)?.status || 503;
        const code = details?.error || (status === 401 ? "login_required" : "local_chat_unavailable");
        return fail(details?.message || (status === 401
          ? "Tu sesión ha caducado. Inicia sesión para continuar."
          : "No se pudo enviar el turno al servidor. Tu mensaje sigue en el cuadro."), status, code);
      }
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
        const response = responseContext(result.error);
        // A rejected request will not recover by polling the same job repeatedly.
        if (response && response.status >= 400 && response.status < 500 && response.status !== 429) {
          const details = await chatErrorReply(result.error, result.data);
          if (details?.error === "job_not_found") {
            try { if (key) localStorage.removeItem(key); } catch { /* ignore */ }
            return fail("Ese turno ya no está en la cola. Reenvía tu mensaje.", 404, "chat_job_expired");
          }
          return fail(details?.message || (response.status === 401
            ? "Tu sesión ha caducado. Inicia sesión para recuperar la respuesta."
            : "El servidor rechazó la consulta de este turno."), response.status,
            details?.error || (response.status === 401 ? "login_required" : "chat_status_rejected"));
        }
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
const ownAi = new Set(["story-chat", "translate", "speech-to-text", "generate-narrative", "generate-novel", "generate-studio-draft", "generate-shorts-series", "illustrate-scene"]);
async function callOwnAi<T>(name: string, body: unknown): Promise<FunctionResult<T>> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(name === "illustrate-scene" ? "/api/illustrate" : "/api/ai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: "Bearer " + session.access_token } : {}),
      },
      body: JSON.stringify({ action: name, body }),
    });
    let data: any = null;
    const text = await response.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text || "Respuesta no disponible del servidor." };
    }
    return response.ok
      ? { data: data as T, error: null }
      : { data: data as T, error: { message: data?.message || data?.error || "La función no está disponible.", context: response } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error de conexión con el servicio de IA.";
    return { data: null, error: { message, context: new Response(null, { status: 503 }) } };
  }
}

/** Retries only transient network, rate-limit, and server failures once. */
export async function invokeFunctionWithRetry<T>(name: string, body: unknown): Promise<FunctionResult<T>> {
  if (name === "story-chat")
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