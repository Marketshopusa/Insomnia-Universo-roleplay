import { beforeEach, expect, it, vi } from "vitest";
const { eq, erase } = vi.hoisted(() => { const eq = vi.fn().mockResolvedValue({ error: null }); return { eq, erase: vi.fn(() => ({ eq })) }; });
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn(() => ({ delete: erase })) } }));
import { clearBrowserConversationHistory, clearSavedStorySessions } from "./ephemeralConversations";

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks(); });
it("erases legacy and scoped transcripts in both stores while preserving login and authored cards", () => {
  for (const store of [localStorage, sessionStorage]) {
    for (const key of ["insomnia_user_chat_history_v1", "insomnia_user_chat_history_v1:account:alice", "talkiemate_exact_history_v3", "insomnia_user_open_convs_v1", "insomnia_legacy_chat_owner_v2"]) store.setItem(key, "OLD_PRIVATE_TURN");
    store.setItem("sb-project-auth-token", "LOGIN"); store.setItem("talkiemate_custom_chars_v2", "AUTHORED_CARD");
  }
  clearBrowserConversationHistory();
  for (const store of [localStorage, sessionStorage]) {
    expect(Object.values(store)).not.toContain("OLD_PRIVATE_TURN");
    expect(store.getItem("sb-project-auth-token")).toBe("LOGIN");
    expect(store.getItem("talkiemate_custom_chars_v2")).toBe("AUTHORED_CARD");
  }
});
it("deletes cloud history only for the authenticated account", async () => {
  await clearSavedStorySessions("alice");
  expect(erase).toHaveBeenCalledTimes(1);
  expect(eq).toHaveBeenCalledWith("user_id", "alice");
});
it("never performs an unscoped deletion for a guest", async () => {
  expect(await clearSavedStorySessions(null)).toBeNull();
  expect(erase).not.toHaveBeenCalled();
});

it("reports a network failure without rejecting a reset", async () => {
  const failure = new Error("network offline");
  eq.mockRejectedValueOnce(failure);
  expect(await clearSavedStorySessions("alice")).toBe(failure);
});
