import { supabase } from "@/integrations/supabase/client";

const HISTORY_KEYS = ["insomnia_user_chat_history_v1", "talkiemate_exact_history_v3", "insomnia_legacy_chat_owner_v2", "insomnia_user_open_convs_v1"];
export function isConversationHistoryKey(key: string) {
  return HISTORY_KEYS.some(base => key === base || key.startsWith(base + ":"));
}
/** Conversation text is transient. Preserve account credentials and authored character settings. */
export function clearBrowserConversationHistory() {
  for (const name of ["localStorage", "sessionStorage"] as const) {
    try {
      const storage = window[name];
      for (const key of Object.keys(storage)) if (isConversationHistoryKey(key)) storage.removeItem(key);
    } catch { /* Restricted browser storage must not prevent a clean in-memory conversation. */ }
  }
}
/** Erase only the signed-in person's old saved conversations; never load or write new ones. */
export async function clearSavedStorySessions(accountId?: string | null) {
  if (!accountId) return null;
  try {
    const { error } = await supabase.from("story_sessions").delete().eq("user_id", accountId);
    return error;
  } catch (error) {
    return error instanceof Error ? error : new Error("Could not erase saved conversations");
  }
}
