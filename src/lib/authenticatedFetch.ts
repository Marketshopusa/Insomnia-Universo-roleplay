import { supabase } from "@/integrations/supabase/client";

type Session = { access_token: string };
type SessionResult = { data: { session: Session | null }; error?: { status?: number } | null };
let refreshing: Promise<SessionResult> | null = null;

function refreshSession(): Promise<SessionResult> {
  if (!refreshing) {
    refreshing = supabase.auth.refreshSession().finally(() => { refreshing = null; });
  }
  return refreshing;
}

function authFailure(unavailable = false) {
  if (!unavailable && typeof window !== "undefined") {
    window.dispatchEvent(new Event("insomnia:auth-required"));
  }
  return new Response(JSON.stringify({
    error: unavailable ? "auth_unavailable" : "login_required",
    message: unavailable
      ? "No se pudo verificar la sesión. Inténtalo de nuevo en unos segundos."
      : "Tu sesión ha caducado. Vuelve a iniciar sesión para continuar.",
  }), { status: unavailable ? 503 : 401, headers: { "Content-Type": "application/json" } });
}

/** Authenticated app requests retry exactly once with a recovered session after 401. */
export async function authenticatedFetch(
  url: string, init: RequestInit = {}, allowAnonymous = false,
): Promise<Response> {
  if (init.signal?.aborted) throw new DOMException("Request aborted", "AbortError");
  let session: Session | null;
  try {
    const result = await supabase.auth.getSession();
    if (result.error) return authFailure(!result.error.status || result.error.status >= 500);
    session = result.data.session;
    if (!session?.access_token && !allowAnonymous) {
      const refreshed = await refreshSession();
      if (refreshed.error) return authFailure(!refreshed.error.status || refreshed.error.status >= 500);
      session = refreshed.data.session;
      if (!session?.access_token) return authFailure();
    }
  } catch {
    return authFailure(true);
  }
  const request = (token?: string) => {
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    else headers.delete("Authorization");
    return fetch(url, { ...init, headers });
  };
  const response = await request(session?.access_token);
  if (response.status !== 401 || allowAnonymous) return response;
  if (init.signal?.aborted) throw new DOMException("Request aborted", "AbortError");
  try {
    const current = await supabase.auth.getSession();
    const recovered = current.data.session?.access_token !== session?.access_token && current.data.session?.access_token
      ? current : await refreshSession();
    if (recovered.error) return authFailure(!recovered.error.status || recovered.error.status >= 500);
    if (!recovered.data.session?.access_token) return authFailure();
    if (init.signal?.aborted) throw new DOMException("Request aborted", "AbortError");
    const retried = await request(recovered.data.session.access_token);
    return retried.status === 401 ? authFailure() : retried;
  } catch (error) {
    if (init.signal?.aborted) throw error;
    return authFailure(true);
  }
}
