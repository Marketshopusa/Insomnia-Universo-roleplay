import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type Role = "h" | "m" | "x";
type Member = { name: string; role: Role; path: string; url: string };
type Pending = { source: File; portrait: File; url: string };
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

/** Crop around a detected face when available; otherwise use the upper centre of the photo. */
async function portraitFrom(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const detectorClass = (window as typeof window & { FaceDetector?: new (options: { maxDetectedFaces: number }) => {
      detect(image: ImageBitmap): Promise<{ boundingBox: DOMRectReadOnly }[]>;
    } }).FaceDetector;
    let face: DOMRectReadOnly | undefined;
    if (detectorClass) {
      try { face = (await new detectorClass({ maxDetectedFaces: 1 }).detect(bitmap))[0]?.boundingBox; }
      catch { /* The passport crop remains available without the experimental detector. */ }
    }
    const side = face
      ? Math.min(bitmap.width, bitmap.height, Math.max(face.width, face.height) * 2.2)
      : Math.min(bitmap.width, bitmap.height);
    const x = face ? face.x + face.width / 2 - side / 2 : (bitmap.width - side) / 2;
    const y = face ? face.y + face.height / 2 - side * 0.43 : bitmap.height > bitmap.width * 1.3 ? 0 : (bitmap.height - side) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 768;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo preparar el retrato.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, 768, 768);
    context.drawImage(bitmap, Math.max(0, Math.min(x, bitmap.width - side)),
      Math.max(0, Math.min(y, bitmap.height - side)), side, side, 0, 0, 768, 768);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error("No se pudo recortar el rostro.")), "image/jpeg", 0.91,
    ));
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + "-rostro.jpg", { type: "image/jpeg" });
  } finally { bitmap.close(); }
}

export function CastGallery({ userId, onPrimary, onSecondary }: {
  userId: string;
  onPrimary: (file: File, name: string) => void;
  onSecondary: (file: File, name: string) => void;
}) {
  const { toast } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("m");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const pendingRef = useRef<Pending[]>([]);
  useEffect(() => { pendingRef.current = pending; }, [pending]);
  useEffect(() => () => pendingRef.current.forEach((item) => URL.revokeObjectURL(item.url)), []);
  const reload = useCallback(async () => {
    const { data, error } = await supabase.storage.from(BUCKET).list(userId, { limit: 100 });
    if (error) throw error;
    const entries = (data || []).flatMap((entry) => {
      const details = parseMember(entry.name);
      return details ? [{ ...details, path: userId + "/" + entry.name }] : [];
    });
    setMembers(await Promise.all(entries.map(async (entry) => {
      const { data: url, error: signedError } = await supabase.storage.from(BUCKET).createSignedUrl(entry.path, 3600);
      if (signedError) throw signedError;
      return { ...entry, url: url?.signedUrl || "" };
    })));
  }, [userId]);
  useEffect(() => {
    void reload().catch((error) => toast({
      title: "No se pudo abrir el reparto guardado.",
      description: error instanceof Error ? error.message : undefined, variant: "destructive",
    }));
  }, [reload]);

  const selectFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    if (members.length + pending.length + files.length > LIMIT) {
      toast({ title: "La galería admite hasta 20 actores.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const selected: Pending[] = [];
      for (const source of Array.from(files)) {
        if (source.size > 10 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(source.type))
          throw new Error("Cada foto debe ser PNG, JPEG o WebP y pesar menos de 10 MB.");
        const portrait = await portraitFrom(source);
        selected.push({ source, portrait, url: URL.createObjectURL(portrait) });
      }
      setPending((current) => [...current, ...selected]);
    } catch (error) {
      toast({ title: "No pude preparar las fotos.", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally { setBusy(false); if (fileInput.current) fileInput.current.value = ""; }
  };
  const add = async () => {
    if (!pending.length) return;
    setBusy(true);
    let saved = 0;
    try {
      for (const item of pending) {
        const actorName = (pending.length === 1 && name.trim() ? name.trim() : item.source.name.replace(/\.[^.]+$/, "")).slice(0, 80);
        const path = userId + "/cast_" + crypto.randomUUID() + "_" + role + "_" + encodeName(actorName) + ".jpg";
        const { error } = await supabase.storage.from(BUCKET).upload(path, item.portrait, { contentType: "image/jpeg", upsert: false });
        if (error) throw error;
        saved += 1;
      }
      pending.forEach((item) => URL.revokeObjectURL(item.url));
      setPending([]); setName("");
      await reload();
      toast({ title: saved + (saved === 1 ? " rostro guardado en el elenco." : " rostros guardados en el elenco.") });
    } catch (error) {
      if (saved) {
        pending.slice(0, saved).forEach((item) => URL.revokeObjectURL(item.url));
        setPending(pending.slice(saved));
        await reload().catch(() => undefined);
      }
      toast({ title: "No se pudo guardar todo el elenco.", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
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
    if (!window.confirm("¿Quitar a " + entry.name + " del elenco?")) return;
    setBusy(true);
    try {
      const { error } = await supabase.storage.from(BUCKET).remove([entry.path]);
      if (error) throw error;
      await reload();
    } catch (error) {
      toast({ title: "No se pudo quitar la foto.", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally { setBusy(false); }
  };
  return <section id="elenco" className="space-y-3" aria-label="Elenco">
    <h2 className="text-lg font-medium">Elenco · {members.length}/{LIMIT} rostros</h2>
    <p className="text-xs text-muted-foreground">Selecciona varias fotos a la vez. Verás un recorte de rostro por actor. El nombre del archivo identifica cada foto; puedes dar otro nombre si agregas solo una.</p>
    <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
      <input aria-label="Nombre del actor" placeholder="Nombre (si agregas una foto)" value={name} onChange={(e) => setName(e.target.value)}
        className="rounded-md border border-border bg-background px-3 py-2 text-sm" maxLength={80} />
      <select aria-label="Grupo del elenco" value={role} onChange={(e) => setRole(e.target.value as Role)}
        className="rounded-md border border-border bg-background px-2 py-2 text-sm">
        <option value="m">Mujeres</option><option value="h">Hombres</option><option value="x">Otros</option>
      </select>
      <input ref={fileInput} aria-label="Fotos del elenco" type="file" multiple accept="image/png,image/jpeg,image/webp"
        onChange={(e) => void selectFiles(e.target.files)} className="max-w-52 text-xs" />
      <Button type="button" variant="outline" disabled={busy || !pending.length} onClick={() => void add()}>
        {busy ? "Preparando…" : "Guardar " + pending.length + (pending.length === 1 ? " rostro" : " rostros")}
      </Button>
    </div>
    {!!pending.length && <div aria-label="Rostros por guardar" className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
      {pending.map((item) => <div key={item.url} className="rounded-md border border-border p-2 text-sm">
        <img src={item.url} alt={item.source.name} className="aspect-square w-full rounded object-cover" />
        <div className="truncate text-xs">{item.source.name.replace(/\.[^.]+$/, "")}</div>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => {
          URL.revokeObjectURL(item.url);
          setPending((current) => current.filter((candidate) => candidate.url !== item.url));
        }}>Quitar</Button>
      </div>)}
    </div>}
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
      {members.map((entry) => <div key={entry.path} className="rounded-md border border-border p-2 text-sm">
        {entry.url ? <img src={entry.url} alt={entry.name} className="aspect-square w-full rounded object-cover" />
          : <div className="aspect-square rounded bg-muted" aria-label="Foto no disponible" />}
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
