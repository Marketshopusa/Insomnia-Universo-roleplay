import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { UserRound, Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { ageFromBirthDate } from "@/lib/birthDate.mjs";
import { safeInternalPath, saveAccountProfile, type ProfileAccount } from "@/lib/accountProfile";

function ProfileEditor({ user, returnTo }: { user: ProfileAccount; returnTo: string }) {
  const { language } = useLanguage();
  const es = language === "es";
  const active = useRef(true);
  const pending = useRef(false);
  const [account, setAccount] = useState<ProfileAccount | null>(null);
  const [username, setUsername] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loginRequired, setLoginRequired] = useState(false);
  const [saved, setSaved] = useState(false);
  const age = ageFromBirthDate(birthDate);
  const selfPath = "/profile?returnTo=" + encodeURIComponent(returnTo);
  const loginHref = "/login?returnTo=" + encodeURIComponent(selfPath);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(""); setLoginRequired(false);
    supabase.auth.getUser().then(({ data, error: failure }) => {
      if (cancelled || !active.current) return;
      if (failure || !data.user || data.user.id !== user.id) {
        setError(es ? "No pudimos cargar tu cuenta. Vuelve a intentarlo o inicia sesión." : "We could not load your account. Retry or sign in.");
        setLoginRequired(true);
        return;
      }
      const current = data.user;
      const metadata = current.user_metadata || {};
      const storedDate = typeof metadata.birth_date === "string" ? metadata.birth_date.slice(0, 10) : "";
      setAccount(current);
      setUsername(String(metadata.username || metadata.full_name || current.email?.split("@")[0] || ""));
      setBirthDate(ageFromBirthDate(storedDate) === null ? "" : storedDate);
    }).catch(() => {
      if (!cancelled && active.current) setError(es ? "No pudimos cargar tu perfil. Revisa la conexión e inténtalo de nuevo." : "We could not load your profile. Check your connection and retry.");
    }).finally(() => { if (!cancelled && active.current) setLoading(false); });
    return () => { cancelled = true; };
  }, [user.id, reload, es]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending.current || !account) return;
    pending.current = true; setSaving(true); setError(""); setSaved(false); setLoginRequired(false);
    try {
      const updated = await saveAccountProfile({ username, birthDate }, user.id, { isCurrent: () => active.current });
      if (!active.current) return;
      setAccount(updated); setUsername(String(updated.user_metadata?.username || username)); setSaved(true);
    } catch (failure: unknown) {
      if (!active.current) return;
      const detail = failure as { code?: string; message?: string };
      setLoginRequired(detail.code === "login_required");
      setError(es ? (detail.message || "No se pudo guardar tu perfil. Inténtalo de nuevo.") : "Your profile could not be saved. Check your details and retry.");
    } finally {
      pending.current = false;
      if (active.current) setSaving(false);
    }
  };
  return (
    <MainLayout>
      <div className="container mx-auto max-w-2xl px-4 py-8 md:py-12">
        <Link to={returnTo} className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />{es ? "Volver" : "Back"}
        </Link>
        <Card className="overflow-hidden border-primary/20">
          <CardHeader className="border-b border-border bg-primary/5">
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary"><UserRound className="h-6 w-6" /></div>
            <CardTitle className="font-display text-3xl">{es ? "Mi perfil" : "My profile"}</CardTitle>
            <CardDescription>{es ? "Consulta y actualiza los datos de tu cuenta." : "View and update your account details."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            {loading ? <div role="status" className="flex items-center gap-2 py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{es ? "Cargando tu perfil…" : "Loading your profile…"}</div> : account ? (
              <form onSubmit={submit} className="space-y-5" aria-label={es ? "Datos de mi perfil" : "My profile details"}>
                <div className="space-y-2">
                  <Label htmlFor="profile-email">{es ? "Correo de la cuenta" : "Account email"}</Label>
                  <Input id="profile-email" type="email" value={account.email || ""} readOnly className="bg-muted/50 text-muted-foreground" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-name">{es ? "Nombre de cuenta" : "Account name"}</Label>
                  <Input id="profile-name" autoComplete="nickname" value={username} onChange={event => { setUsername(event.target.value); setSaved(false); }} required maxLength={80} disabled={saving} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-birth-date">{es ? "Fecha de nacimiento" : "Date of birth"}</Label>
                  <Input id="profile-birth-date" type="date" style={{ colorScheme: "dark" }} autoComplete="bday" value={birthDate} onChange={event => { setBirthDate(event.target.value); setSaved(false); }} required max={new Date().toISOString().slice(0, 10)} min={(new Date().getUTCFullYear() - 125) + "-01-01"} disabled={saving} aria-describedby="birth-date-help" />
                  <p id="birth-date-help" className="text-sm leading-relaxed text-muted-foreground">{es ? "Introduce tu fecha real. Se guarda en tu cuenta para calcular tu edad declarada y revisar el acceso al modo adulto." : "Enter your real birth date. It is saved to your account to calculate your declared age and check access to adult mode."}</p>
                  {age !== null && <p className="text-sm">{es ? "Edad declarada:" : "Declared age:"} <strong>{age} {es ? "años" : "years"}</strong>{age < 18 && <span className="block text-destructive">{es ? "El modo adulto no está disponible para esta edad." : "Adult mode is not available for this age."}</span>}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
                  <Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{saving ? (es ? "Guardando…" : "Saving…") : (es ? "Guardar cambios" : "Save changes")}</Button>
                  {saved && <Link to={returnTo} className="inline-flex min-h-9 items-center text-sm font-medium text-primary hover:underline">{es ? "Continuar" : "Continue"}</Link>}
                </div>
                {saved && <p role="status" className="flex items-start gap-2 text-sm text-emerald-400"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{es ? "Datos guardados. Tu próxima solicitud utilizará la fecha actualizada." : "Details saved. Your next request will use the updated birth date."}</p>}
              </form>
            ) : <Button type="button" variant="outline" onClick={() => setReload(value => value + 1)}>{es ? "Reintentar" : "Retry"}</Button>}
            {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}{loginRequired && <Link to={loginHref} className="mt-2 block font-semibold underline">{es ? "Iniciar sesión" : "Sign in"}</Link>}</div>}
            <p className="text-xs leading-relaxed text-muted-foreground">{es ? "La fecha es una declaración de edad; este formulario no realiza verificación documental." : "The date is an age declaration; this form does not perform document verification."}</p>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
export default function Profile() {
  const { user, loading } = useAuth();
  const { language } = useLanguage();
  const location = useLocation();
  let returnTo = safeInternalPath(new URLSearchParams(location.search).get("returnTo"), "/chat");
  if (returnTo.startsWith("/profile")) returnTo = "/chat";
  if (loading) return <MainLayout><p role="status" className="p-8 text-center text-muted-foreground">{language === "es" ? "Cargando tu cuenta…" : "Loading your account…"}</p></MainLayout>;
  if (!user) return <Navigate to={"/login?returnTo=" + encodeURIComponent(location.pathname + location.search)} replace />;
  return <ProfileEditor key={user.id} user={user} returnTo={returnTo} />;
}
