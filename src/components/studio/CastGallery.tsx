import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Star, Users, Upload, Sparkles } from "lucide-react";

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

export function CastGallery({ userId, onPrimary, onSecondary, onSupporting, onAssignCustom }: {
  userId: string;
  onPrimary: (file: File, name: string) => void;
  onSecondary: (file: File, name: string) => void;
  onSupporting: (file: File, name: string) => void;
  onAssignCustom?: (file: File, name: string) => void;
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
  }, [reload, toast]);

  const selectFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    if (members.length + pending.length + files.length > LIMIT) {
      toast({ title: "La galería admite hasta 20 actores.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const sources = Array.from(files);
      for (const source of sources) {
        if (source.size > 10 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(source.type))
          throw new Error("Cada foto debe ser PNG, JPEG o WebP y pesar menos de 10 MB.");
      }
      const selected = await Promise.all(
        sources.map(async (source) => {
          const portrait = await portraitFrom(source);
          return { source, portrait, url: URL.createObjectURL(portrait) };
        }),
      );
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
      await Promise.all(
        pending.map(async (item) => {
          const rawName = pending.length === 1 && name.trim() ? name.trim() : item.source.name.replace(/\.[^.]+$/, "");
          const cleanName = (/^(captura|screenshot|img|image|foto)/i.test(rawName) || !rawName.trim()) ? "Actor " + (members.length + saved + 1) : rawName;
          const actorName = cleanName.slice(0, 80);
          const path = userId + "/cast_" + crypto.randomUUID() + "_" + role + "_" + encodeName(actorName) + ".jpg";
          const { error } = await supabase.storage.from(BUCKET).upload(path, item.portrait, { contentType: "image/jpeg", upsert: false });
          if (error) throw error;
          saved += 1;
        }),
      );
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
  const applyMember = async (entry: Member, position: "primary" | "secondary" | "supporting" | "custom") => {
    setBusy(true);
    try {
      const { data, error } = await supabase.storage.from(BUCKET).download(entry.path);
      if (error || !data) throw error || new Error("La foto no está disponible.");
      const file = new File([data], entry.path.split("/").at(-1) || "actor.jpg", { type: data.type });
      if (position === "primary") onPrimary(file, entry.name);
      else if (position === "secondary") onSecondary(file, entry.name);
      else if (position === "supporting") onSupporting(file, entry.name);
      else if (position === "custom" && onAssignCustom) onAssignCustom(file, entry.name);
      toast({ title: `${entry.name} asignado como ${position === "primary" ? "Protagonista" : position === "secondary" ? "Co-Protagonista" : "Reparto"}.` });
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

  return (
    <section id="elenco" className="space-y-4" aria-label="Elenco de actores">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border/50 pb-2">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
            <Users className="w-4 h-4 text-primary" />
            Galería de Actores Guardados ({members.length}/{LIMIT})
          </h3>
          <p className="text-xs text-muted-foreground">Toca cualquier rostro para asignarlo como Protagonista o Co-Protagonista en 1 clic.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card/60 hover:bg-accent text-xs font-medium transition-colors">
            <Upload className="w-3.5 h-3.5" />
            <span>Subir nueva foto</span>
            <input ref={fileInput} type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(e) => void selectFiles(e.target.files)} className="hidden" />
          </label>
        </div>
      </div>

      {/* Mini form for adding pending uploaded faces */}
      {!!pending.length && (
        <div className="p-3 rounded-xl border border-primary/30 bg-primary/5 space-y-3">
          <div className="text-xs font-semibold text-primary flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> {pending.length} foto(s) lista(s) para guardar en tu galería:
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {pending.map((item) => (
              <div key={item.url} className="relative rounded-lg border border-border bg-card p-1 text-center">
                <img src={item.url} alt={item.source.name} className="aspect-square w-full rounded object-cover" />
                <div className="truncate text-[11px] font-medium mt-1">{item.source.name.replace(/\.[^.]+$/, "")}</div>
                <button
                  type="button"
                  onClick={() => {
                    URL.revokeObjectURL(item.url);
                    setPending((current) => current.filter((c) => c.url !== item.url));
                  }}
                  className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/70 hover:bg-red-600 text-white flex items-center justify-center transition-colors"
                  title="Descartar"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              placeholder="Nombre del personaje (ej: Carlos, Elena)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs"
              maxLength={80}
            />
            <Button type="button" size="sm" disabled={busy || !pending.length} onClick={() => void add()} className="text-xs">
              {busy ? "Guardando..." : "Guardar en Galería"}
            </Button>
          </div>
        </div>
      )}

      {/* Grid of faces */}
      {members.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-border rounded-xl bg-card/20 text-muted-foreground text-xs space-y-2">
          <Users className="w-8 h-8 mx-auto opacity-40" />
          <p>No tienes actores guardados todavía.</p>
          <p className="text-[11px] opacity-75">Sube una foto o captura de un rostro para usarlo como actor recurrente.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {members.map((entry) => (
            <div
              key={entry.path}
              className="group relative rounded-xl border border-border/70 bg-card/60 hover:bg-card/90 hover:border-primary/50 transition-all p-2 flex flex-col justify-between shadow-sm"
            >
              <div className="relative">
                {entry.url ? (
                  <img src={entry.url} alt={entry.name} className="aspect-square w-full rounded-lg object-cover bg-black/20" />
                ) : (
                  <div className="aspect-square rounded-lg bg-muted flex items-center justify-center text-xs text-muted-foreground">Foto</div>
                )}
                {/* Delete button (discreet top-right) */}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove(entry)}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md bg-black/60 hover:bg-destructive text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow"
                  title="Eliminar rostro de galería"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>

              <div className="my-2">
                <div className="truncate text-xs font-semibold text-foreground">{entry.name}</div>
                <div className="text-[10px] text-muted-foreground capitalize">{entry.role === "m" ? "Mujer" : entry.role === "h" ? "Hombre" : "Reparto"}</div>
              </div>

              {/* 2 Clear, Prominent Action Buttons */}
              <div className="grid grid-cols-2 gap-1 pt-1 border-t border-border/40">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void applyMember(entry, "primary")}
                  className="h-7 text-[10px] px-1 hover:bg-primary/20 hover:text-primary hover:border-primary/40 font-medium"
                  title="Asignar como actor principal"
                >
                  <Star className="w-2.5 h-2.5 mr-1 text-amber-400" /> Protagonista
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void applyMember(entry, "secondary")}
                  className="h-7 text-[10px] px-1 hover:bg-secondary hover:text-foreground font-medium"
                  title="Asignar como segundo protagonista"
                >
                  🎭 Co-Estrella
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
