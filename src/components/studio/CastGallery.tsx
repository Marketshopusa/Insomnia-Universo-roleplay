import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type Role = "h" | "m" | "x";
type Member = { name: string; role: Role; path: string; url: string };
const BUCKET = "kineva-references";
const LIMIT = 20;

function encodeName(name: string) {
  let binary = "";
  for (const byte of new TextEncoder().encode(name)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeName(encoded: string) {
  return new TextDecoder().decode(Uint8Array.from(atob(encoded.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0)));
}
function parseMember(filename: string) {
  const match = /^cast_[0-9a-f-]{36}_([hmx])_([A-Za-z0-9_-]+)\.(png|jpg|jpeg|webp)$/i.exec(filename);
  if (!match) return null;
  try { return { name: decodeName(match[2]), role: match[1].toLowerCase() as Role }; }
  catch { return null; }
}

export function CastGallery({ userId, onPrimary, onSecondary }: {
  userId: string;
  onPrimary: (file: File, name: string) => void;
  onSecondary: (file: File, name: string) => void;
}) {
  const { toast } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("m");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => {
    const { data, error } = await supabase.storage.from(BUCKET).list(userId, { limit: 100 });
    if (error) throw error;
    const entries = (data || []).flatMap((entry) => {
      const details = parseMember(entry.name);
      return details ? [{ ...details, path: userId + "/" + entry.name }] : [];
    });
    setMembers(await Promise.all(entries.map(async (entry) => {
      const { data: url } = await supabase.storage.from(BUCKET).createSignedUrl(entry.path, 3600);
      return { ...entry, url: url?.signedUrl || "" };
    })));
  }, [userId]);
  useEffect(() => {
    void reload().catch(() => toast({ title: "No se pudo abrir el reparto guardado.", variant: "destructive" }));
  }, [reload]);

  const add = async () => {
    if (!name.trim() || !photo) {
      toast({ title: "Pon el nombre y la foto del actor.", variant: "destructive" });
      return;
    }
    if (members.length >= LIMIT || photo.size > 10 * 1024 * 1024 ||
        !["image/png", "image/jpeg", "image/webp"].includes(photo.type)) {
      toast({ title: "La galería admite 20 fotos PNG, JPEG o WebP de hasta 10 MB.", variant: "destructive" });
      return;
    }
    const ext = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
    const path = userId + "/cast_" + crypto.randomUUID() + "_" + role + "_" + encodeName(name.trim().slice(0, 80)) + "." + ext;
    setBusy(true);
    try {
      const { error } = await supabase.storage.from(BUCKET).upload(path, photo, { contentType: photo.type, upsert: false });
      if (error) throw error;
      setName(""); setPhoto(null);
      await reload();
    } catch (error) {
      toast({ title: "No se pudo guardar el actor.", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally { setBusy(false); }
  };
  const useMember = async (entry: Member, asPrimary: boolean) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.storage.from(BUCKET).download(entry.path);
      if (error || !data) throw error || new Error("La foto no está disponible.");
      const file = new File([data], entry.path.split("/").at(-1) || "actor.jpg", { type: data.type });
      if (asPrimary) onPrimary(file, entry.name);
      else onSecondary(file, entry.name);
      toast({ title: entry.name + " seleccionado para esta serie." });
    } catch (error) {
      toast({ title: "No se pudo cargar esa foto.", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally { setBusy(false); }
  };
  const remove = async (entry: Member) => {
    if (!window.confirm("¿Quitar a " + entry.name + " de la galería?")) return;
    setBusy(true);
    try {
      const { error } = await supabase.storage.from(BUCKET).remove([entry.path]);
      if (error) throw error;
      await reload();
    } catch (error) {
      toast({ title: "No se pudo quitar la foto.", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally { setBusy(false); }
  };
  return <section className="space-y-3" aria-label="Fotos del reparto">
    <h3 className="font-medium">Fotos del reparto · {members.length}/{LIMIT}</h3>
    <p className="text-xs text-muted-foreground">Guarda hasta 20 rostros para otras series. Elige los dos protagonistas de la toma; los demás quedan en la galería para elegirlos cuando participen.</p>
    <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
      <input aria-label="Nombre del actor" placeholder="Nombre del actor" value={name} onChange={(e) => setName(e.target.value)}
        className="rounded-md border border-border bg-background px-3 py-2 text-sm" maxLength={80} />
      <select aria-label="Grupo del reparto" value={role} onChange={(e) => setRole(e.target.value as Role)}
        className="rounded-md border border-border bg-background px-2 py-2 text-sm">
        <option value="m">Mujeres</option><option value="h">Hombres</option><option value="x">Otros</option>
      </select>
      <input aria-label="Foto del actor" type="file" accept="image/png,image/jpeg,image/webp"
        onChange={(e) => setPhoto(e.target.files?.[0] || null)} className="max-w-52 text-xs" />
      <Button type="button" variant="outline" disabled={busy || members.length >= LIMIT} onClick={() => void add()}>Agregar</Button>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {members.map((entry) => <div key={entry.path} className="rounded-md border border-border p-2 text-sm">
        {entry.url && <img src={entry.url} alt={entry.name} className="mb-2 aspect-[3/4] w-full rounded object-cover" />}
        <div className="truncate font-medium">{entry.name}</div>
        <div className="text-xs text-muted-foreground">{entry.role === "m" ? "Mujer" : entry.role === "h" ? "Hombre" : "Reparto"}</div>
        <div className="mt-2 flex flex-wrap gap-1">
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void useMember(entry, true)}>Principal</Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void useMember(entry, false)}>Segundo</Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void remove(entry)}>Quitar</Button>
        </div>
      </div>)}
    </div>
  </section>;
}
