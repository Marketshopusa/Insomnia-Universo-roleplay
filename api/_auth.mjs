import { createClient } from "@supabase/supabase-js";
import { supabaseUrl, publishableKey } from "./_config.mjs";

/** A rejected session and an unavailable auth service require different recovery. */
export async function authenticationFailure(req, options = {}) {
  const environment = options.environment || process.env;
  if (environment.NODE_ENV !== "production" && !environment.VERCEL) return null;
  const jwt = String(req.headers?.authorization || "").replace(/^Bearer\s+/i, "").trim();
  const expired = { status: 401, error: "login_required", message: "Tu sesión ha caducado. Vuelve a iniciar sesión para continuar." };
  const unavailable = { status: 503, error: "auth_unavailable", message: "No se pudo verificar la sesión. Inténtalo de nuevo en unos segundos." };
  if (!jwt) return expired;
  try {
    const factory = options.clientFactory || createClient;
    const { data, error } = await factory(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } }).auth.getUser(jwt);
    if (!error && data?.user) return null;
    if (error && (!error.status || error.status >= 500)) return unavailable;
    return expired;
  } catch {
    return unavailable;
  }
}
