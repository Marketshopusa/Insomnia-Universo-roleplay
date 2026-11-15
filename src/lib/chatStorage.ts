export const CHAT_STORAGE = {
  history: "insomnia_user_chat_history_v1",
  characters: "talkiemate_custom_chars_v2",
  open: "insomnia_user_open_convs_v1",
} as const;
type StoredTurn = { id: string; role: "user" | "assistant"; content: string; timestamp: string };
export type ChatHistory = Record<string, StoredTurn[]>;
const LEGACY_OWNER = "insomnia_legacy_chat_owner_v2";

export function chatStorageKey(base: string, accountId?: string | null) {
  return base + ":account:" + encodeURIComponent(accountId || "guest");
}
function storage(accountId?: string | null) { return accountId ? localStorage : sessionStorage; }
export function readChatValue<T>(base: string, accountId: string | null | undefined, fallback: T): T {
  try { const raw = storage(accountId).getItem(chatStorageKey(base, accountId)); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
export function writeChatValue(base: string, accountId: string | null | undefined, value: unknown) {
  storage(accountId).setItem(chatStorageKey(base, accountId), JSON.stringify(value));
}
/** Remove only identified generated starters; preserve real messages, including the first reply. */
export function cleanChatHistory(value: unknown): ChatHistory {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const clean: ChatHistory = {};
  for (const [card, turns] of Object.entries(value)) {
    if (!Array.isArray(turns)) continue;
    clean[card] = turns.filter((m): m is StoredTurn => !!m && typeof m.id === "string" &&
      !m.id.startsWith("starter-") && m.id !== "intro" && ["user", "assistant"].includes(m.role) &&
      typeof m.content === "string" && !!m.content.trim()).map(m => ({ ...m, timestamp: typeof m.timestamp === "string" ? m.timestamp : "" }));
  }
  return clean;
}
export function readChatHistory(accountId?: string | null): ChatHistory {
  return cleanChatHistory(readChatValue(CHAT_STORAGE.history, accountId, {}));
}
export function legacyChatAvailable(accountId?: string | null) {
  if (!accountId) return false;
  try {
    const owner = localStorage.getItem(LEGACY_OWNER);
    if (owner) return false;
    return Object.values(CHAT_STORAGE).some(key => !!localStorage.getItem(key));
  } catch { return false; }
}
/** Legacy records have no owner. Import only after the person explicitly claims them. Never delete the originals. */
export async function recoverLegacyChat(accountId: string) {
  const recover = () => {
    const owner = localStorage.getItem(LEGACY_OWNER);
    if (owner && owner !== accountId) throw new Error("Estas conversaciones ya se recuperaron en otra cuenta.");
    const legacy = cleanChatHistory(JSON.parse(localStorage.getItem(CHAT_STORAGE.history) || "{}"));
    const current = readChatHistory(accountId);
    const history = { ...legacy, ...current };
    const oldCharacters = JSON.parse(localStorage.getItem(CHAT_STORAGE.characters) || "[]");
    const currentCharacters = readChatValue<any[]>(CHAT_STORAGE.characters, accountId, []);
    const characters = [...currentCharacters, ...(Array.isArray(oldCharacters) ? oldCharacters : [])]
      .filter((c, index, all) => c && typeof c.id === "string" && all.findIndex(other => other?.id === c.id) === index);
    const oldOpen = JSON.parse(localStorage.getItem(CHAT_STORAGE.open) || "[]");
    const open = [...new Set([...readChatValue<string[]>(CHAT_STORAGE.open, accountId, []), ...(Array.isArray(oldOpen) ? oldOpen : [])])].filter(id => typeof id === "string");
    writeChatValue(CHAT_STORAGE.history, accountId, history);
    writeChatValue(CHAT_STORAGE.characters, accountId, characters);
    writeChatValue(CHAT_STORAGE.open, accountId, open);
    localStorage.setItem(LEGACY_OWNER, accountId);
    return { history, characters, open };
  };
  if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request("insomnia-legacy-chat-recovery", recover);
  return recover();
}

/** Write only changed cards, so another tab's unrelated dialogue is not overwritten by a stale snapshot. */
export function persistChatChanges(previous: ChatHistory, next: ChatHistory, accountId?: string | null) {
  const changed = [...new Set([...Object.keys(previous), ...Object.keys(next)])].filter(id => previous[id] !== next[id]);
  if (!changed.length) return;
  const merged = readChatHistory(accountId);
  for (const id of changed) {
    if (next[id]) merged[id] = next[id]; else delete merged[id];
  }
  writeChatValue(CHAT_STORAGE.history, accountId, merged);
}
