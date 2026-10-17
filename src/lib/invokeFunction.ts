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

async function callLocalLlama<T>(body: unknown): Promise<FunctionResult<T> | null> {
  try {
    const input = body as {
      story?: { title?: string; description?: string; story_context?: string; character_role?: string; player_role?: string };
      userMessage?: string;
      history?: { role: string; content: string }[];
      language?: string;
    };
    const health = await fetch("http://127.0.0.1:8788/health", { signal: AbortSignal.timeout(400) }).catch(() => null);
    if (!health?.ok) return null;

    const characterName = input.story?.character_role || "Personaje";
    const playerName = input.story?.player_role || "Usuario";
    const systemPrompt = `Eres ${characterName} en un roleplay cinematográfico inmersivo para adultos al estilo Momoo AI interactuando con ${playerName} (Director).
REGLA SUPREMA: 100% español nativo.
PROPORCIÓN: 70% diálogo hablado directo / 30% acotaciones breves en primera persona (*acción*).
Alterna: *gesto breve o sonido de 3 a 8 palabras* -> Diálogo hablado -> *reacción corporal/sonido* -> Diálogo hablado.
NUNCA hables ni actúes por ${playerName}. Detén tu respuesta en cuanto tu personaje termine de actuar y hablar.`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...(input.history || []).slice(-12).map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
      { role: "user", content: input.userMessage || "" },
    ];

    const res = await fetch("http://127.0.0.1:8788/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "magnum-v4-12b",
        messages,
        max_tokens: 280,
        temperature: 0.8,
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    let content = data?.choices?.[0]?.message?.content?.trim();
    if (content) {
      content = content.replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u30ff]/g, "").trim();
      return { data: { content } as T, error: null };
    }
    return null;
  } catch {
    return null;
  }
}

/** Retries only transient network, rate-limit, and server failures once. */
export async function invokeFunctionWithRetry<T>(name: string, body: unknown): Promise<FunctionResult<T>> {
  if (name === "story-chat") {
    // 1. If local llama-server (PC GPU on port 8788) is online, use it directly (0 credits, instant response)
    const local = await callLocalLlama<T>(body);
    if (local?.data) return local;
  }
  if (ownAi.has(name)) {
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
