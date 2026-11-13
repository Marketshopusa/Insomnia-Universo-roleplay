import { supabase } from "@/integrations/supabase/client";
import { ageFromBirthDate } from "./birthDate.mjs";

export type ProfileAccount = { id: string; email?: string; user_metadata?: Record<string, unknown> };
type Result = { data: { user: ProfileAccount | null }; error: { message: string } | null };
type ProfileAuth = {
  getUser(): Promise<Result>;
  getSession?(): Promise<{ data: { session: { user: { id: string } } | null }; error?: { message: string } | null }>;
  updateUser(value: { data: { username: string; birth_date: string } }): Promise<Result>;
};
export function safeInternalPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) return fallback;
  try {
    const parsed = new URL(value, "https://insomnia.invalid");
    return parsed.origin === "https://insomnia.invalid" ? parsed.pathname + parsed.search + parsed.hash : fallback;
  } catch { return fallback; }
}
export function profileHref(returnTo: string): string {
  const safe = safeInternalPath(returnTo, "/chat");
  return "/profile?returnTo=" + encodeURIComponent(safe.startsWith("/profile") ? "/chat" : safe);
}
function fail(code: string, message: string): never { throw Object.assign(new Error(message), { code }); }
export async function saveAccountProfile(
  input: { username: string; birthDate: string },
  expectedUserId: string,
  { auth = supabase.auth as ProfileAuth, isCurrent = () => true }: { auth?: ProfileAuth; isCurrent?: () => boolean } = {},
): Promise<ProfileAccount> {
  const username = input.username.trim();
  if (!username || username.length > 80) fail("invalid_profile_name", "Indica un nombre de cuenta de hasta 80 caracteres.");
  if (ageFromBirthDate(input.birthDate) === null) fail("invalid_birth_date", "Indica una fecha de nacimiento completa y válida.");
  if (!isCurrent()) fail("account_changed", "La cuenta cambió. Vuelve a abrir tu perfil.");
  const current = await auth.getUser();
  if (current.error || !current.data.user) fail("login_required", "Vuelve a iniciar sesión para guardar tu perfil.");
  if (current.data.user.id !== expectedUserId || !isCurrent()) fail("account_changed", "La cuenta cambió. Vuelve a abrir tu perfil.");
  if (auth.getSession) {
    const session = await auth.getSession();
    if (session.error || !session.data.session) fail("login_required", "Vuelve a iniciar sesión para guardar tu perfil.");
    if (session.data.session.user.id !== expectedUserId || !isCurrent()) fail("account_changed", "La cuenta cambió. Vuelve a abrir tu perfil.");
  }
  // Update only the current account's editable metadata, never roles or eligibility flags.
  const result = await auth.updateUser({ data: { username, birth_date: input.birthDate } });
  if (result.error) throw result.error;
  if (!isCurrent()) fail("account_changed", "La cuenta cambió.");
  const saved = result.data.user;
  if (!saved || saved.id !== expectedUserId || saved.user_metadata?.birth_date !== input.birthDate) {
    fail("profile_save_unconfirmed", "No se pudo confirmar el guardado. Revisa tu perfil y vuelve a intentarlo.");
  }
  return saved;
}
