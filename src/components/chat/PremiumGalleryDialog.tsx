import React, { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Flame,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Upload,
  Trash2,
  Star,
  ExternalLink,
  Plus,
  Image as ImageIcon,
  Film,
  Loader2,
  Check,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { CharacterItem } from "./ChatCharacterConfigDialog";
import { isMediaVideo } from "./ChatCharacterConfigDialog";

interface PremiumGalleryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  character: CharacterItem;
  isAdmin: boolean;
  onSaveCharacter: (updated: CharacterItem) => void;
  onOpenConfig?: (tab?: "info" | "photos" | "voice") => void;
}

export const PremiumGalleryDialog: React.FC<PremiumGalleryDialogProps> = ({
  open,
  onOpenChange,
  character,
  isAdmin,
  onSaveCharacter,
  onOpenConfig,
}) => {
  const { language } = useLanguage();
  const isEs = language === "es";

  const gallery = (character.gallery && character.gallery.length > 0)
    ? character.gallery
    : [character.avatar];

  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [newUrlInput, setNewUrlInput] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeMedia = gallery[selectedIdx] || gallery[0] || character.avatar;
  const isVid = isMediaVideo(activeMedia);

  const handleNext = () => {
    setSelectedIdx((prev) => (prev + 1) % gallery.length);
  };

  const handlePrev = () => {
    setSelectedIdx((prev) => (prev - 1 + gallery.length) % gallery.length);
  };

  // Upload multiple files directly into gallery for Admin
  const handleUploadFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    setIsUploading(true);
    const addedUrls: string[] = [];

    try {
      for (const file of files) {
        if (file.size > 60 * 1024 * 1024) continue;
        const ext = file.name.split(".").pop() || (file.type.startsWith("video") ? "mp4" : "jpg");
        const path = `admin_gallery/${character.id}/${crypto.randomUUID()}.${ext}`;

        let uploadedUrl = "";
        try {
          const { error } = await supabase.storage
            .from("user-story-covers")
            .upload(path, file, { upsert: false, contentType: file.type });

          if (!error) {
            const { data } = supabase.storage.from("user-story-covers").getPublicUrl(path);
            if (data?.publicUrl) uploadedUrl = data.publicUrl;
          }
        } catch {
          // fallback to data url
        }

        if (!uploadedUrl) {
          uploadedUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string) || "");
            reader.onerror = () => resolve("");
            reader.readAsDataURL(file);
          });
        }

        if (uploadedUrl && !gallery.includes(uploadedUrl) && !addedUrls.includes(uploadedUrl)) {
          addedUrls.push(uploadedUrl);
        }
      }

      if (addedUrls.length > 0) {
        const updatedGallery = [...gallery, ...addedUrls];
        const updatedChar: CharacterItem = {
          ...character,
          gallery: updatedGallery,
          imageCount: Math.max(character.imageCount, updatedGallery.length),
        };
        onSaveCharacter(updatedChar);
        setSelectedIdx(gallery.length); // point to first new upload
        toast({
          title: isEs ? "Fotos añadidas con éxito" : "Photos added successfully",
          description: isEs
            ? `Se han agregado ${addedUrls.length} fotos a la galería de ${character.name}.`
            : `Added ${addedUrls.length} photos to ${character.name}'s gallery.`,
        });
      }
    } catch (err: any) {
      toast({
        title: isEs ? "Error al subir archivos" : "Upload error",
        description: String(err?.message || err).slice(0, 120),
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAddUrl = () => {
    const trimmed = newUrlInput.trim();
    if (!trimmed) return;
    if (gallery.includes(trimmed)) {
      toast({
        title: isEs ? "Ya está en la galería" : "Already in gallery",
      });
      return;
    }
    const updatedGallery = [...gallery, trimmed];
    const updatedChar: CharacterItem = {
      ...character,
      gallery: updatedGallery,
      imageCount: Math.max(character.imageCount, updatedGallery.length),
    };
    onSaveCharacter(updatedChar);
    setNewUrlInput("");
    setSelectedIdx(updatedGallery.length - 1);
    toast({
      title: isEs ? "Foto añadida a la galería" : "Photo added",
    });
  };

  const handleDeletePhoto = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (gallery.length <= 1) {
      toast({
        description: isEs
          ? "No puedes eliminar la única foto del personaje."
          : "Cannot delete the only photo.",
        variant: "destructive",
      });
      return;
    }
    const targetUrl = gallery[idx];
    const updatedGallery = gallery.filter((_, i) => i !== idx);
    const newAvatar = character.avatar === targetUrl ? updatedGallery[0] : character.avatar;
    const updatedChar: CharacterItem = {
      ...character,
      avatar: newAvatar,
      gallery: updatedGallery,
      imageCount: Math.max(1, character.imageCount - 1),
    };
    onSaveCharacter(updatedChar);
    if (selectedIdx >= updatedGallery.length) {
      setSelectedIdx(updatedGallery.length - 1);
    }
    toast({
      title: isEs ? "Foto eliminada" : "Photo deleted",
    });
  };

  const handleSetPrimaryAvatar = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const targetUrl = gallery[idx];
    const updatedChar: CharacterItem = {
      ...character,
      avatar: targetUrl,
    };
    onSaveCharacter(updatedChar);
    toast({
      title: isEs ? "Avatar principal actualizado" : "Main avatar updated",
      description: isEs
        ? `Esta foto ahora es la foto de perfil principal de ${character.name}.`
        : `This photo is now the primary avatar.`,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] p-0 overflow-hidden bg-[#0d0d0d] border border-[#ff8c00]/40 text-white shadow-2xl flex flex-col">
        {/* Header */}
        <DialogHeader className="p-4 px-6 bg-gradient-to-r from-[#1a0c02] via-[#120801] to-[#0d0d0d] border-b border-[#262626] flex-shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <img
                  src={character.avatar}
                  alt={character.name}
                  className="w-11 h-11 rounded-full object-cover border-2 border-[#ff8c00]"
                />
                <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-black flex items-center justify-center text-[9px] font-bold">
                  ✓
                </span>
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
                  <span>{character.name}</span>
                  <span className="text-xs font-normal text-zinc-400">
                    • {isEs ? (character.roleTitleEs || character.roleTitle) : (character.roleTitleEn || character.roleTitle)}
                  </span>
                  {isAdmin && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold uppercase tracking-wider">
                      <ShieldCheck className="w-3 h-3 text-amber-400" /> Admin
                    </span>
                  )}
                </DialogTitle>
                <DialogDescription className="text-xs text-zinc-400 flex items-center gap-2 mt-0.5">
                  <span className="text-[#ff8c00] font-semibold flex items-center gap-1">
                    <Flame className="w-3.5 h-3.5 fill-[#ff8c00]" />
                    {isAdmin
                      ? (isEs ? "Contenido 100% Desbloqueado para Administrador" : "100% Unlocked for Administrator")
                      : (isEs ? "Galería Exclusiva Premium" : "Exclusive Premium Gallery")}
                  </span>
                  <span>•</span>
                  <span>{gallery.length} {isEs ? "fotos y videos en total" : "total media"}</span>
                </DialogDescription>
              </div>
            </div>

            {isAdmin && onOpenConfig && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  onOpenConfig("photos");
                }}
                className="hidden sm:flex items-center gap-1.5 text-xs border-[#ff8c00]/40 text-[#ff8c00] hover:bg-[#ff8c00]/10"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                {isEs ? "Editor Completo" : "Full Editor"}
              </Button>
            )}
          </div>
        </DialogHeader>

        {/* Main Body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
          {/* Main Hero Viewer */}
          <div className="relative aspect-[16/10] md:aspect-[16/9] max-h-[50vh] w-full rounded-2xl overflow-hidden bg-black border border-[#2a2a2a] flex items-center justify-center group shadow-2xl">
            {isVid ? (
              <video
                key={activeMedia}
                src={activeMedia}
                controls
                autoPlay
                playsInline
                className="w-full h-full object-contain"
              />
            ) : (
              <img
                key={activeMedia}
                src={activeMedia}
                alt={`${character.name} - ${selectedIdx + 1}`}
                className="w-full h-full object-contain transition-all duration-300"
              />
            )}

            {/* Navigation Arrows */}
            {gallery.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={handlePrev}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/70 hover:bg-[#ff8c00] text-white flex items-center justify-center border border-white/20 hover:border-[#ff8c00] transition-all shadow-lg"
                  aria-label="Foto anterior"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/70 hover:bg-[#ff8c00] text-white flex items-center justify-center border border-white/20 hover:border-[#ff8c00] transition-all shadow-lg"
                  aria-label="Foto siguiente"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}

            {/* Position Pill */}
            <div className="absolute bottom-3 right-3 px-3 py-1 rounded-full bg-black/80 backdrop-blur-md border border-white/10 text-xs font-semibold text-zinc-300">
              {selectedIdx + 1} / {gallery.length}
            </div>

            {/* Current is Primary Badge */}
            {character.avatar === activeMedia && (
              <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-[#ff8c00]/90 text-black text-[11px] font-bold flex items-center gap-1 shadow-md">
                <Star className="w-3 h-3 fill-black" />
                {isEs ? "Foto de Perfil Principal" : "Primary Avatar"}
              </div>
            )}
          </div>

          {/* Admin Controls Toolbar */}
          {isAdmin && (
            <div className="p-3.5 rounded-xl bg-[#171717] border border-[#2a2a2a] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5 uppercase tracking-wider">
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                  {isEs ? "Herramientas de Administrador" : "Administrator Tools"}
                </span>

                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"
                    onChange={handleUploadFiles}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={isUploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-[#ff8c00] hover:bg-[#e07b00] text-black font-bold text-xs gap-1.5 h-8 shadow-md"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {isEs ? "Subiendo..." : "Uploading..."}
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5" />
                        {isEs ? `+ Subir Fotos / Videos a ${character.name}` : `+ Upload to ${character.name}`}
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* URL input */}
              <div className="flex items-center gap-2">
                <Input
                  placeholder={isEs ? "O pega enlace directo a imagen o video (https://...)" : "Or paste direct media URL"}
                  value={newUrlInput}
                  onChange={(e) => setNewUrlInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddUrl(); }}
                  className="h-8 text-xs bg-[#0d0d0d] border-[#2e2e2e]"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAddUrl}
                  disabled={!newUrlInput.trim()}
                  className="h-8 text-xs border-[#ff8c00]/50 text-[#ff8c00] hover:bg-[#ff8c00]/10 flex-shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" /> {isEs ? "Añadir" : "Add"}
                </Button>
              </div>
            </div>
          )}

          {/* Thumbnails Gallery Grid */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span className="font-semibold uppercase tracking-wider text-zinc-300">
                {isEs ? "Colección de Fotos y Videos" : "Media Collection"} ({gallery.length})
              </span>
              <span className="text-[11px]">
                {isEs ? "Haz clic para ver en grande" : "Click to view full size"}
              </span>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2.5 max-h-[28vh] overflow-y-auto p-1 rounded-xl bg-[#141414] border border-[#222]">
              {gallery.map((mediaUrl, idx) => {
                const isSelected = selectedIdx === idx;
                const isItemVid = isMediaVideo(mediaUrl);
                const isPrimary = character.avatar === mediaUrl;

                return (
                  <div
                    key={idx}
                    onClick={() => setSelectedIdx(idx)}
                    className={`group relative aspect-square rounded-xl overflow-hidden cursor-pointer border-2 transition-all bg-black ${
                      isSelected
                        ? "border-[#ff8c00] ring-2 ring-[#ff8c00]/60 scale-[1.03]"
                        : "border-[#262626] hover:border-[#ff8c00]/60"
                    }`}
                  >
                    {isItemVid ? (
                      <video
                        src={mediaUrl}
                        muted
                        playsInline
                        className="w-full h-full object-cover pointer-events-none"
                      />
                    ) : (
                      <img
                        src={mediaUrl}
                        alt={`Thumb ${idx + 1}`}
                        className="w-full h-full object-cover pointer-events-none"
                      />
                    )}

                    {/* Media Type Badge */}
                    {isItemVid && (
                      <div className="absolute top-1 left-1 p-0.5 rounded bg-black/80 text-[#ff8c00]">
                        <Film className="w-2.5 h-2.5" />
                      </div>
                    )}

                    {/* Primary Star Indicator */}
                    {isPrimary && (
                      <div className="absolute top-1 right-1 p-0.5 rounded-full bg-[#ff8c00] text-black">
                        <Star className="w-2.5 h-2.5 fill-black" />
                      </div>
                    )}

                    {/* Admin Actions Overlay on Hover */}
                    {isAdmin && (
                      <div className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 p-1">
                        {!isPrimary && (
                          <button
                            type="button"
                            title={isEs ? "Fijar como foto principal" : "Set as primary"}
                            onClick={(e) => handleSetPrimaryAvatar(idx, e)}
                            className="p-1.5 rounded-md bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-black transition-colors"
                          >
                            <Star className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          type="button"
                          title={isEs ? "Eliminar de la galería" : "Delete photo"}
                          onClick={(e) => handleDeletePhoto(idx, e)}
                          className="p-1.5 rounded-md bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
