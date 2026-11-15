import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { clearBrowserConversationHistory, clearSavedStorySessions, isConversationHistoryKey } from "@/lib/ephemeralConversations";

export function ConversationPrivacy() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  useEffect(() => {
    clearBrowserConversationHistory();
    const clearLegacyWrite = (event: StorageEvent) => {
      if (event.key && isConversationHistoryKey(event.key)) clearBrowserConversationHistory();
    };
    window.addEventListener("storage", clearLegacyWrite);
    return () => window.removeEventListener("storage", clearLegacyWrite);
  }, []);
  useEffect(() => {
    let active = true;
    const clear = async () => {
      try {
        const error = await clearSavedStorySessions(user?.id);
        if (error) throw error;
        queryClient.removeQueries({ queryKey: ["reading-history-full"] });
        queryClient.removeQueries({ queryKey: ["reading-history"] });
      } catch {
        if (active) toast({ title: language === "es" ? "No se pudo borrar el historial antiguo de la cuenta" : "Could not erase the account's old history", description: language === "es" ? "No se cargará. Se reintentará al recuperar la conexión." : "It will not be loaded. Erasure will retry when the connection returns.", variant: "destructive" });
      }
    };
    void clear();
    window.addEventListener("online", clear);
    return () => { active = false; window.removeEventListener("online", clear); };
  }, [user?.id, queryClient]);
  return null;
}
