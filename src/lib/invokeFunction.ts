import { supabase } from "@/integrations/supabase/client";

const wait = (milliseconds: number) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

function responseContext(error: unknown) {
  if (!error || typeof error !== "object" || !("context" in error)) return null;
  const context = (error as { context?: Response }).context;
  return context instanceof Response ? context : null;
}

/** Retries only transient network, rate-limit, and server failures once. */
export async function invokeFunctionWithRetry<T>(name: string, body: unknown) {
  let result = await supabase.functions.invoke<T>(name, { body });
  if (!result.error) return result;

  const context = responseContext(result.error);
  const status = context?.status ?? null;
  const retryable = status === null || status === 429 || status >= 500;
  if (!retryable) return result;

  const retryAfter = Number(context?.headers.get("retry-after"));
  const delay = Number.isFinite(retryAfter)
    ? Math.min(retryAfter * 1000, 5000)
    : 900 + Math.floor(Math.random() * 300);
  await wait(delay);
  result = await supabase.functions.invoke<T>(name, { body });
  return result;
}