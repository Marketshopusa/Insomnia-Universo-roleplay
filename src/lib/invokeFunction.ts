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
    story?: { id?: string; title?: string; description?: string; story_context?: string; character_role?: string; player_role?: string };
    userMessage?: string;
    history?: { role: string; content: string }[];
    memory?: { role: string; content: string }[];
  };
  const prior = (input.history || []).slice();
  if (prior.at(-1)?.role === "user" && prior.at(-1)?.content === input.userMessage) prior.pop();
  const data = new TextEncoder().encode(JSON.stringify([
    input.story?.id, input.story?.title, input.story?.description,
    input.story?.story_context, input.story?.character_role, input.story?.player_role,
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
        body: { action: "create", adultMode: true, ...(body as object) },
      });
      if (created.error || !created.data?.jobId)
        return callOwnAi<T>("story-chat", body);
      jobId = created.data.jobId;
      try { if (key) localStorage.setItem(key, JSON.stringify({ jobId, signature, createdAt: Date.now() })); } catch { /* ignore */ }
    }
    let consecutiveErrors = 0;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await wait(consecutiveErrors ? 300 : 250);
      const result = await supabase.functions.invoke<ChatReply>("adult-story-chat", {
        body: { action: "status", jobId },
      });
      if (result.error) {
        consecutiveErrors += 1;
        if (consecutiveErrors >= 3) {
          try { if (key) localStorage.removeItem(key); } catch { /* ignore */ }
          return callOwnAi<T>("story-chat", body);
        }
        continue;
      }
      consecutiveErrors = 0;
      if (result.data?.status === "completed" && result.data.content) {
        try { if (key) localStorage.removeItem(key); } catch { /* ignore */ }
        return { data: { content: result.data.content } as T, error: null };
      }
      if (result.data?.status === "failed" || result.data?.error === "job_not_found") {
        try { if (key) localStorage.removeItem(key); } catch { /* ignore */ }
        return callOwnAi<T>("story-chat", body);
      }
    }
    try { if (key) localStorage.removeItem(key); } catch { /* ignore */ }
    return callOwnAi<T>("story-chat", body);
  } catch {
    return callOwnAi<T>("story-chat", body);
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
