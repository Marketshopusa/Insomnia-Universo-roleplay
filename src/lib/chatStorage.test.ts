import { beforeEach, expect, it } from "vitest";
import { CHAT_STORAGE, chatStorageKey, cleanChatHistory, readChatHistory, readChatValue, writeChatValue, recoverLegacyChat, legacyChatAvailable } from "./chatStorage";
const turn = (id: string, content = id) => ({ id, role: "assistant" as const, content, timestamp: "10:00" });
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
it("keeps each account and its cards in separate records", () => {
  writeChatValue(CHAT_STORAGE.history, "one", { a: [turn("A_ONLY")], b: [turn("B_ONLY")] });
  writeChatValue(CHAT_STORAGE.history, "two", { a: [turn("OTHER_ACCOUNT")] });
  expect(readChatHistory("one").a[0].content).toBe("A_ONLY");
  expect(readChatHistory("one").b[0].content).toBe("B_ONLY");
  expect(readChatHistory("two").a[0].content).toBe("OTHER_ACCOUNT");
  expect(JSON.stringify(readChatHistory("two"))).not.toContain("A_ONLY");
});
it("does not expose unowned legacy history to a newly opened account", () => {
  localStorage.setItem(CHAT_STORAGE.history, JSON.stringify({ a: [turn("PRIVATE_LEGACY")] }));
  expect(readChatHistory("new")).toEqual({});
  expect(legacyChatAvailable("new")).toBe(true);
});
it("recovers old conversations only for the account that claims them, without deleting the original", async () => {
  const original = JSON.stringify({ a: [turn("starter-a", "FIXED_GREETING"), turn("REAL_REPLY")] });
  localStorage.setItem(CHAT_STORAGE.history, original);
  const recovered = await recoverLegacyChat("owner");
  expect(recovered.history.a.map(m => m.id)).toEqual(["REAL_REPLY"]);
  expect(localStorage.getItem(CHAT_STORAGE.history)).toBe(original);
  await expect(recoverLegacyChat("another")).rejects.toThrow();
  expect(readChatHistory("another")).toEqual({});
});
it("never replaces an existing first generated reply with a configured greeting", () => {
  const value = { a: [turn("generated-1", "ORIGINAL_REPLY"), turn("generated-2", "ANOTHER_REPLY")] };
  expect(cleanChatHistory(value)).toEqual(value);
});
it("removes identified automatic starters, preserving unrelated real messages", () => {
  expect(cleanChatHistory({ a: [turn("starter-a"), turn("real")], b: [turn("real-b")] }).a.map(m => m.id)).toEqual(["real"]);
});
it("keeps anonymous conversations in the current tab, separate from signed-in records", () => {
  writeChatValue(CHAT_STORAGE.history, null, { a: [turn("GUEST")] });
  expect(localStorage.getItem(chatStorageKey(CHAT_STORAGE.history, null))).toBeNull();
  expect(readChatHistory(null).a[0].content).toBe("GUEST");
  expect(readChatHistory("one")).toEqual({});
});
it("does not merge an older dialogue over a newer dialogue in the same card during recovery", async () => {
  localStorage.setItem(CHAT_STORAGE.history, JSON.stringify({ a: [turn("OLD")], b: [turn("RECOVER_B")] }));
  writeChatValue(CHAT_STORAGE.history, "owner", { a: [turn("NEW")] });
  const recovered = await recoverLegacyChat("owner");
  expect(recovered.history.a[0].content).toBe("NEW");
  expect(recovered.history.b[0].content).toBe("RECOVER_B");
});

it("preserves another tab's update to B when this tab changes only A", async () => {
  const { persistChatChanges } = await import("./chatStorage");
  const original = { a: [turn("A_BEFORE")], b: [turn("B_BEFORE")] };
  writeChatValue(CHAT_STORAGE.history, "owner", { ...original, b: [turn("B_FROM_OTHER_TAB")] });
  persistChatChanges(original, { ...original, a: [turn("A_AFTER")] }, "owner");
  expect(readChatHistory("owner").b[0].content).toBe("B_FROM_OTHER_TAB");
  expect(readChatHistory("owner").a[0].content).toBe("A_AFTER");
});
