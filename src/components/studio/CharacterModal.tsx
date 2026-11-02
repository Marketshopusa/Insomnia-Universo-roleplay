import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Upload, Check, Trash2, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const BUCKET = "kineva-references";

export interface CastMember {
  id: string;
  name: string;
  path: string;
  url: string;
  role: "m" | "h" | "cast";
}

interface CharacterModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  roleTitle: string; // e.g. "Protagonista" or "Co-Protagonista / Antagonista"
  currentName: string;
  onSelectCharacter: (file: File, name: string, previewUrl?: string) => void;
}

export function CharacterModal({
  open,
  onOpenChange,
  userId,
  roleTitle,
  currentName,
  onSelectCharacter,
}: CharacterModalProps) {
  const { toast } = useToast();
  const [members, setMembers] = useState<CastMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing gallery faces from private storage
  const loadGallery = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.storage.from(BUCKET).list(userId, { limit: 100 });
      if (error) throw error;

      const validFiles = (data || []).filter(
        (f) => f.name && !f.name.startsWith(".") && /\.(png|jpg|jpeg|webp)$/i.test(f.name)
      );

      const resolved = await Promise.all(
        validFiles.map(async (entry) => {
          const path = `${userId}/${entry.name}`;
          const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 900);
          
          // Parse name from filename (e.g. cast_uuid_h_Diego.jpg)
          let parsedName = entry.name.replace(/\.[^.]+$/, "");
          if (parsedName.includes("_")) {
            const parts = parsedName.split("_");
            parsedName = parts.slice(3).join(" ") || parts[1] || parsedName;
            if (/^[A-Za-z0-9+/=_-]{12,}$/.test(parsedName)) {
              try {
                const dec = atob(parsedName.replace(/-/g, "+").replace(/_/g, "/"));
                parsedName = dec && !/captura|screenshot|img_/i.test(dec) ? dec : "Actor";
              } catch { parsedName = "Actor"; }
            }
            if (/captura|screenshot|img_|\.png|\.jpg/i.test(parsedName) || /^[0-9a-f-]{36}$/i.test(parsedName)) {
              parsedName = "Actor";
            }
          }

          return {
            id: entry.id || entry.name,
            name: decodeURIComponent(parsedName).replace(/[-_]/g, " "),
            path,
            url: signed?.signedUrl || "",
            role: "cast" as const,
          };
        })
      );

      setMembers(resolved.filter((m) => Boolean(m.url)));
    } catch (err: any) {
      console.warn("Error cargando elenco:", err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void loadGallery();
    }
  }, [open, userId]);

  // Handle selecting an existing face from studio gallery with 1 single click
  const handlePickExisting = async (member: CastMember) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.storage.from(BUCKET).download(member.path);
      if (error || !data) throw error || new Error("No se pudo obtener la imagen.");

      const file = new File([data], `${member.name}.jpg`, { type: data.type || "image/jpeg" });
      const chosenName = member.name && member.name !== "Actor" && member.name !== "Actor Guardado" ? member.name : (currentName || roleTitle);
      onSelectCharacter(file, chosenName, member.url);
      toast({ title: `✓ ${chosenName} asignado como ${roleTitle}` });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error al seleccionar actor", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Handle file chosen from PC
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast({ title: "Formato no válido", description: "Sube una imagen PNG, JPEG o WebP.", variant: "destructive" });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Imagen muy pesada", description: "El tamaño máximo es de 10 MB.", variant: "destructive" });
      return;
    }

    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    if (!newName.trim()) {
      const cleanName = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
      setNewName(cleanName.slice(0, 30));
    }
  };

  // Upload new photo and directly assign
  const handleUploadAndAssign = async () => {
    if (!selectedFile || !userId) return;
    setUploading(true);
    try {
      const actorName = newName.trim() || `Actor ${members.length + 1}`;
      const fileExt = selectedFile.name.split(".").pop() || "jpg";
      const fileName = `cast_${crypto.randomUUID()}_m_${encodeURIComponent(actorName)}.${fileExt}`;
      const path = `${userId}/${fileName}`;

      const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, selectedFile, {
        contentType: selectedFile.type,
        upsert: false,
      });

      if (uploadErr) throw uploadErr;

      // Assign to current role
      onSelectCharacter(selectedFile, actorName, previewUrl || undefined);
      toast({ title: `✓ ${actorName} guardado en el estudio y asignado como ${roleTitle}` });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error al subir la imagen", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  // Delete face from studio gallery
  const handleDeleteFace = async (e: React.MouseEvent, member: CastMember) => {
    e.stopPropagation();
    if (!confirm(`¿Eliminar a "${member.name}" de la galería de actores guardados?`)) return;

    try {
      const { error } = await supabase.storage.from(BUCKET).remove([member.path]);
      if (error) throw error;
      setMembers((prev) => prev.filter((m) => m.path !== member.path));
      toast({ title: `Actor eliminado del estudio.` });
    } catch (err: any) {
      toast({ title: "No se pudo eliminar", description: err.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-neutral-950 border border-neutral-800 text-white p-6 rounded-2xl shadow-2xl">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-xl font-bold flex items-center gap-2 text-white">
            <Users className="w-5 h-5 text-primary" />
            Asignar {roleTitle}
          </DialogTitle>
          <DialogDescription className="text-xs text-neutral-400">
            Elige un actor guardado de tu estudio en 1 clic o importa una foto nueva desde tu computadora.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="gallery" className="mt-4">
          <TabsList className="grid grid-cols-2 bg-neutral-900 border border-neutral-800 p-1 rounded-xl">
            <TabsTrigger value="gallery" className="text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-black">
              📁 Mi Elenco Guardado ({members.length})
            </TabsTrigger>
            <TabsTrigger value="upload" className="text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-black">
              💻 Subir Nueva Foto desde PC
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: MI ELENCO GUARDADO */}
          <TabsContent value="gallery" className="mt-4 focus:outline-none">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-neutral-400">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="text-xs">Cargando actores del estudio...</span>
              </div>
            ) : members.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-neutral-800 rounded-xl bg-neutral-900/40 p-6 space-y-3">
                <Users className="w-10 h-10 mx-auto text-neutral-600" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-neutral-300">No tienes actores guardados todavía</p>
                  <p className="text-xs text-neutral-500">
                    Pasa a la pestaña "Subir Nueva Foto" para agregar tu primer actor o actriz recurrente.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[360px] overflow-y-auto pr-1">
                {members.map((member) => {
                  const isCurrent = currentName.toLowerCase() === member.name.toLowerCase();
                  return (
                    <div
                      key={member.path}
                      onClick={() => void handlePickExisting(member)}
                      className={`group relative rounded-xl border p-2 cursor-pointer transition-all duration-200 flex flex-col items-center text-center bg-neutral-900/60 hover:bg-neutral-800/80 ${
                        isCurrent
                          ? "border-primary ring-2 ring-primary/60 shadow-lg shadow-primary/20"
                          : "border-neutral-800 hover:border-neutral-700"
                      }`}
                    >
                      <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-black/40 mb-2">
                        <img
                          src={member.url}
                          alt={member.name}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        {isCurrent && (
                          <div className="absolute top-1.5 left-1.5 bg-primary text-black rounded-full p-0.5 shadow-md">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={(e) => void handleDeleteFace(e, member)}
                          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md bg-black/70 hover:bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Eliminar actor del estudio"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <span className="text-xs font-bold text-neutral-200 truncate w-full px-1">
                        {member.name}
                      </span>
                      <span className="text-[10px] text-neutral-500 mt-0.5">
                        {isCurrent ? "✓ Asignado" : "Toca para asignar"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* TAB 2: SUBIR DESDE PC */}
          <TabsContent value="upload" className="mt-4 space-y-4 focus:outline-none">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-neutral-700 hover:border-primary/70 rounded-xl p-6 text-center cursor-pointer transition-colors bg-neutral-900/40 hover:bg-neutral-900/80 flex flex-col items-center justify-center gap-3"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />

              {previewUrl ? (
                <div className="relative w-28 h-28 rounded-xl overflow-hidden border-2 border-primary shadow-lg">
                  <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity text-xs font-semibold">
                    Cambiar foto
                  </div>
                </div>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-neutral-200">
                      Arrastra una foto aquí o haz clic para explorar tu PC
                    </p>
                    <p className="text-xs text-neutral-500">PNG, JPG o WebP (Máx. 10 MB)</p>
                  </div>
                </>
              )}
            </div>

            {selectedFile && (
              <div className="space-y-3 bg-neutral-900/60 p-4 rounded-xl border border-neutral-800">
                <div className="space-y-1.5">
                  <Label htmlFor="actor-name" className="text-xs font-semibold text-neutral-300">
                    Nombre del Personaje / Actor:
                  </Label>
                  <Input
                    id="actor-name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Ejemplo: Carlos, Elena, Inspector Morales..."
                    className="bg-neutral-950 border-neutral-700 text-sm"
                    maxLength={50}
                  />
                </div>

                <Button
                  type="button"
                  onClick={() => void handleUploadAndAssign()}
                  disabled={uploading}
                  className="w-full font-bold bg-primary text-black hover:bg-primary/90 flex items-center justify-center gap-2"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Guardando y asignando...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 fill-black" />
                      <span>Guardar en Estudio y Asignar como {roleTitle}</span>
                    </>
                  )}
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
