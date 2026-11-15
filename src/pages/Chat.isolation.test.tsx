import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ user: { id: "one" } as { id: string } | null, reply: vi.fn(), speech: vi.fn(), toast: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: state.user, loading: false, isAdmin: true }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "es" }) }));
vi.mock("@/contexts/AdultModeContext", () => ({ useAdultMode: () => ({ enabled: false, consentGiven: false }) }));
vi.mock("@/components/layout/Header", () => ({ Header: () => null }));
vi.mock("@/components/chat/ChatCharacterConfigDialog", () => ({ ChatCharacterConfigDialog: () => null, isMediaVideo: () => false }));
vi.mock("@/components/chat/PremiumGalleryDialog", () => ({ PremiumGalleryDialog: () => null }));
vi.mock("@/components/story/ChatAiSettingsDialog", () => ({ ChatAiSettingsDialog: () => null }));
vi.mock("@/lib/invokeFunction", () => ({ invokeFunctionWithRetry: state.reply }));
vi.mock("@/lib/ttsStream", () => ({ streamSpeech: state.speech }));
vi.mock("@/hooks/use-toast", () => ({ toast: state.toast }));
import ChatPage, { resolveChatIdentity } from "./Chat";
import { CHAT_STORAGE, readChatHistory, writeChatValue } from "@/lib/chatStorage";
const char = (id: string, name: string) => ({ id, name, age: 30, gender: "female", style: "realistic", roleTitle: "Bibliotecaria", roleTitleEs: "Bibliotecaria", bio: "Trabaja con la amiga de su hermana.", bioEs: "Trabaja con la amiga de su hermana.", avatar: "", gallery: [], shortBio: "", likesCount: "0", imageCount: 0, audioCount: 0, affinityLevel: 0, affinityTitle: "", affinityXp: 0, category: "featured", starterMessage: "PREWRITTEN_GREETING", starterMessageEs: "PREWRITTEN_GREETING", voiceName: "Leda" });
const msg = (id: string, content = id) => ({ id, role: "assistant", content, timestamp: "10:00" });
function Harness() {
  const navigate = useNavigate();
  return <><button onClick={() => navigate("/chat/b")}>Abrir B</button><Routes><Route path="/chat/:characterId" element={<ChatPage />} /></Routes></>;
}
function open() { return render(<MemoryRouter initialEntries={["/chat/a"]}><Harness /></MemoryRouter>); }
function send(text: string) { const input = screen.getByPlaceholderText("Escribe un mensaje..."); fireEvent.change(input, { target: { value: text } }); fireEvent.keyDown(input, { key: "Enter" }); }
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  state.user = { id: "one" }; state.reply.mockReset(); state.speech.mockReset(); state.toast.mockReset();
  state.speech.mockReturnValue({ done: Promise.resolve(), stop: vi.fn() });
  Element.prototype.scrollIntoView = vi.fn();
  writeChatValue(CHAT_STORAGE.characters, "one", [char("a", "Ana"), char("b", "Berta")]);
  writeChatValue(CHAT_STORAGE.characters, "two", [char("a", "Ana"), char("b", "Berta")]);
});
it("starts without an inserted assistant greeting", async () => {
  open(); await screen.findByPlaceholderText("Escribe un mensaje...");
  expect(screen.queryByText("PREWRITTEN_GREETING")).not.toBeInTheDocument();
  state.reply.mockResolvedValue({ data: { content: "Respuesta generada para este turno." }, error: null });
  send("Hola desde A");
  await waitFor(() => expect(state.reply).toHaveBeenCalledTimes(1));
  const body = state.reply.mock.calls[0][1];
  expect(body.history).toEqual([]); expect(body.memory).toEqual([]);
  expect(body.story.character_role).toContain("Ana");
  expect(body.story.character_role).not.toContain("hermana");
  expect(body.story.player_role).toBe("Usuario");
});
it("drops a delayed A reply after opening B, without saving or speaking it", async () => {
  let resolve!: (value: unknown) => void;
  state.reply.mockReturnValue(new Promise(done => { resolve = done; }));
  writeChatValue(CHAT_STORAGE.history, "one", { a: [msg("A_PRIVATE")], b: [msg("B_PRIVATE")] });
  open(); await screen.findAllByText("A_PRIVATE");
  send("Pregunta A");
  await waitFor(() => expect(state.reply).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByText("Abrir B")); await screen.findAllByText("B_PRIVATE");
  await act(async () => resolve({ data: { content: "LATE_A_REPLY" }, error: null }));
  expect(screen.queryByText("LATE_A_REPLY")).not.toBeInTheDocument();
  expect(JSON.stringify(readChatHistory("one").b)).not.toContain("LATE_A_REPLY");
  expect(state.speech).not.toHaveBeenCalled();
  expect(JSON.stringify(readChatHistory("one").a)).not.toContain("Pregunta A");
});
it("sends only B's own dialogue, memory and premise when switching from A", async () => {
  writeChatValue(CHAT_STORAGE.history, "one", { a: [msg("A_SECRET")], b: [msg("B_OWN")] });
  state.reply.mockResolvedValue({ data: { content: "Nueva respuesta B." }, error: null });
  open(); await screen.findAllByText("A_SECRET");
  fireEvent.click(screen.getByText("Abrir B")); await screen.findAllByText("B_OWN");
  send("Pregunta B"); await waitFor(() => expect(state.reply).toHaveBeenCalledTimes(1));
  expect(state.reply.mock.calls[0][1].story.id).toBe("b");
  expect(JSON.stringify(state.reply.mock.calls[0][1])).not.toContain("A_SECRET");
});
it("remounts and reloads account-scoped conversations on account change", async () => {
  writeChatValue(CHAT_STORAGE.history, "one", { a: [msg("ACCOUNT_ONE_PRIVATE")] });
  writeChatValue(CHAT_STORAGE.history, "two", { a: [msg("ACCOUNT_TWO_PRIVATE")] });
  const view = open(); await screen.findAllByText("ACCOUNT_ONE_PRIVATE");
  state.user = { id: "two" };
  view.rerender(<MemoryRouter initialEntries={["/chat/a"]}><Harness /></MemoryRouter>);
  await screen.findAllByText("ACCOUNT_TWO_PRIVATE");
  expect(screen.queryByText("ACCOUNT_ONE_PRIVATE")).not.toBeInTheDocument();
});
it("preserves the first real generated reply across re-renders", async () => {
  writeChatValue(CHAT_STORAGE.history, "one", { a: [msg("real-1", "ORIGINAL_FIRST_REPLY")] });
  const view = open(); await screen.findAllByText("ORIGINAL_FIRST_REPLY");
  view.rerender(<MemoryRouter initialEntries={["/chat/a"]}><Harness /></MemoryRouter>);
  expect(screen.getAllByText("ORIGINAL_FIRST_REPLY").length).toBeGreaterThan(0);
  expect(readChatHistory("one").a[0].content).toBe("ORIGINAL_FIRST_REPLY");
});
it("does not infer an interlocutor relationship from relatives mentioned in a biography", () => {
  const roles = resolveChatIdentity(char("a", "Ana") as any, [], true);
  expect(roles.resolvedCharRole).toBe("Ana (Bibliotecaria)");
  expect(roles.playerRoleName).toBe("Usuario");
});
