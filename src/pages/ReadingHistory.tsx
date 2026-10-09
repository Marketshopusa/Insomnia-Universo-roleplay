import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Link, useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { History, Play, Trash2, ArrowUpRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { resolveStoryCover } from "@/lib/storyCover";
import { useStoryCustomizations } from "@/hooks/useStoryCustomizations";
import { mediaTypeOf } from "@/components/story/StoryConfigDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const ReadingHistory = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: customizations } = useStoryCustomizations();

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: history, isLoading } = useQuery({
    queryKey: ["reading-history-full", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data: sessions, error } = await supabase
        .from("story_sessions")
        .select("id, story_id, last_mode, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const ids = [...new Set((sessions || []).map((s: any) => s.story_id))];
      if (ids.length === 0) return [];
      const { data: storiesData } = await supabase
        .from("stories")
        .select("id, title, cover_image, story_type, character_role, player_role, has_explicit_images")
        .in("id", ids);
      const byId = new Map((storiesData || []).map((s: any) => [s.id, s]));
      return (sessions || [])
        .filter((s: any) => byId.has(s.story_id))
        .map((s: any) => ({ ...s, story: byId.get(s.story_id) }));
    },
    enabled: !!user,
  });

  const handleDeleteSession = async (storyId: string) => {
    if (!user) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("story_sessions")
        .delete()
        .eq("user_id", user.id)
        .eq("story_id", storyId);
      if (error) throw error;
      toast({ title: "Historia eliminada de tu historial" });
      queryClient.invalidateQueries({ queryKey: ["reading-history-full", user.id] });
      queryClient.invalidateQueries({ queryKey: ["reading-history", user.id] });
    } catch {
      toast({ title: "No se pudo eliminar del historial", variant: "destructive" });
    } finally {
      setDeleting(false);
      setConfirmDeleteId(null);
    }
  };

  const handleClearAll = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("story_sessions")
        .delete()
        .eq("user_id", user.id);
      if (error) throw error;
      toast({ title: "Historial vaciado por completo" });
      queryClient.invalidateQueries({ queryKey: ["reading-history-full", user.id] });
      queryClient.invalidateQueries({ queryKey: ["reading-history", user.id] });
    } catch {
      toast({ title: "No se pudo vaciar el historial", variant: "destructive" });
    } finally {
      setDeleting(false);
      setConfirmDeleteId(null);
    }
  };

  if (!user) {
    return (
      <MainLayout>
        <div className="container mx-auto px-4 py-16 text-center">
          <h1 className="text-3xl font-display mb-4">Historial</h1>
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle>{t("myStories.loginRequired")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">{t("myStories.loginMessage")}</p>
              <Link to="/login">
                <Button className="w-full">{t("nav.login")}</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2">
              <History className="w-7 h-7 text-primary" />
              <h1 className="text-3xl font-display">Historial de lectura y roleplay</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Historias que has leído o jugado recientemente. Cada tarjeta incluye su clasificación y puedes eliminarla del historial.
            </p>
          </div>
          {history && history.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:bg-destructive hover:text-destructive-foreground self-start sm:self-auto"
              onClick={() => setConfirmDeleteId("all")}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Vaciar historial
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-20 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Cargando historial...
          </div>
        ) : !history || history.length === 0 ? (
          <Card className="text-center py-16 border-dashed">
            <CardContent>
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4 text-2xl">
                📖
              </div>
              <h3 className="text-lg font-medium mb-1">Aún no tienes historial</h3>
              <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                Cuando leas una historia o participes en un roleplay, aparecerá aquí para que puedas retomarla o gestionarla.
              </p>
              <Link to="/">
                <Button>Explorar historias</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {history.map((item: any) => {
              const story = item.story;
              const media = resolveStoryCover(story?.cover_image, customizations?.[item.story_id]?.cover_media_url);
              const isAdult = story?.story_type === "real_sex" || !!story?.has_explicit_images;
              return (
                <div
                  key={item.id}
                  className="group relative cursor-pointer border border-border/60 bg-card/60 backdrop-blur-sm overflow-hidden hover:border-primary/60 hover:-translate-y-1 hover:shadow-[0_20px_40px_-15px_hsl(var(--primary)/0.4)] transition-all duration-300"
                  onClick={() => navigate(`/story/${item.story_id}`)}
                >
                  <div className="aspect-[4/5] relative bg-muted overflow-hidden">
                    {media ? (
                      mediaTypeOf(media) === "video" ? (
                        <video src={media} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" muted loop playsInline autoPlay />
                      ) : (
                        <img src={media} alt={story.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                      )
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl bg-gradient-to-br from-secondary to-muted">
                        📖
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />

                    {/* Botón papelera para eliminar de historial */}
                    <button
                      type="button"
                      aria-label="Eliminar del historial"
                      title="Eliminar del historial"
                      className="absolute top-0 right-0 z-10 flex h-8 w-8 items-center justify-center border-l border-b border-border/60 bg-background/85 text-destructive backdrop-blur transition-colors hover:bg-destructive hover:text-destructive-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteId(item.story_id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>

                    {/* Clasificación: +18 vs SFW */}
                    <div className="absolute top-2 left-2 flex items-center gap-1 z-10">
                      {isAdult ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider bg-destructive/90 text-destructive-foreground uppercase shadow-sm">
                          +18
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium tracking-wider bg-background/80 text-foreground/80 border border-border/60 uppercase shadow-sm">
                          SFW
                        </span>
                      )}
                    </div>

                    {/* Modo: Roleplay vs Lectura */}
                    <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1 text-[10px] uppercase tracking-wider text-accent">
                      <Play className="w-3 h-3" />
                      {item.last_mode === "roleplay" ? "Roleplay" : "Lectura"}
                    </div>
                  </div>

                  <div className="p-3 space-y-1.5">
                    <h3 className="font-display text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                      {story?.title}
                    </h3>
                    {story?.character_role && (
                      <p className="text-[11px] text-muted-foreground truncate">
                        <span className="text-accent/80">▸</span> {story.character_role}
                      </p>
                    )}
                    <div className="flex items-center justify-between pt-1.5 border-t border-border/40 text-[10px] text-muted-foreground">
                      <span>{new Date(item.updated_at).toLocaleDateString()}</span>
                      <ArrowUpRight className="w-3 h-3 group-hover:text-primary transition-transform" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal confirmación de borrado */}
        <AlertDialog open={!!confirmDeleteId} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirmDeleteId === "all" ? "¿Vaciar todo el historial?" : "¿Eliminar del historial?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirmDeleteId === "all"
                  ? "Se eliminarán todas las sesiones y conversaciones guardadas de tu historial. Las historias originales seguirán intactas."
                  : "Se eliminará esta sesión y su conversación de tu historial de lectura. La historia original seguirá intacta."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                disabled={deleting}
                className="bg-destructive hover:bg-destructive/90"
                onClick={() => {
                  if (confirmDeleteId === "all") {
                    handleClearAll();
                  } else if (confirmDeleteId) {
                    handleDeleteSession(confirmDeleteId);
                  }
                }}
              >
                {deleting ? "Eliminando..." : t("common.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </MainLayout>
  );
};

export default ReadingHistory;
