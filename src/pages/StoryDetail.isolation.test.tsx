import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: { id: "account-one" },
  adultEnabled: false, consentGiven: false, callProps: vi.fn(),
  loads: {} as Record<string, Promise<unknown>>,
  reply: vi.fn(), save: vi.fn(), remove: vi.fn(), speech: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: state.user, loading: false }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "es", t: (key: string) => key }) }));
vi.mock("@/contexts/AdultModeContext", () => ({ useAdultMode: () => ({ enabled: state.adultEnabled, consentGiven: state.consentGiven }) }));
vi.mock("@/hooks/useStories", () => ({ useStory: (id: string) => ({ data: { id, title: `Tarjeta ${id}`, description: `Premisa ${id}`, character_role: `Personaje ${id}`, player_role: "Visita", story_type: "roleplay" }, isLoading: false }) }));
vi.mock("@/hooks/useStoryCustomizations", () => ({ useStoryCustomizations: () => ({ data: {} }) }));
vi.mock("@/hooks/useTranslatedTexts", () => ({ useTranslatedTexts: (texts: string[]) => texts, useTranslatedText: (text: string) => text }));
vi.mock("@/components/layout/MainLayout", () => ({ MainLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/chat/ChatCharacterConfigDialog", () => ({ fallbackFemaleSpeech: vi.fn() }));
vi.mock("@/components/story/CallDialog", () => ({ CallDialog: (props: unknown) => { state.callProps(props); return null; } }));
vi.mock("@/components/story/ChatAiSettingsDialog", () => ({ ChatAiSettingsDialog: () => null }));
vi.mock("@/components/story/VoiceMenu", () => ({ VoiceMenu: () => null }));
vi.mock("@/components/story/RegionMenu", () => ({ RegionMenu: () => null }));
vi.mock("@/lib/foleyStudio", () => ({ playSceneFoley: vi.fn() }));
vi.mock("@/lib/ttsStream", () => ({ streamSpeech: state.speech }));
vi.mock("@/lib/invokeFunction", () => ({ invokeFunctionWithRetry: state.reply }));
vi.mock("@/lib/sceneImage", () => ({ generateSceneImage: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    const filters: Record<string, string> = {};
    const chain = {
      select: () => chain,
      eq: (key: string, value: string) => { filters[key] = value; return chain; },
      order: () => Promise.resolve({ data: [] }),
      maybeSingle: () => state.loads[filters.story_id] || Promise.resolve({ data: null, error: null }),
      upsert: (row: unknown) => { state.save(row); return Promise.resolve({ error: null }); },
      delete: () => { state.remove(table); return chain; },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
    };
    return chain;
  },
} }));

import StoryDetail from "./StoryDetail";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function Harness() {
  const navigate = useNavigate();
  return <><button onClick={() => navigate("/story/b")}>Abrir B</button><Routes><Route path="/story/:storyId" element={<StoryDetail />} /></Routes></>;
}
const session = (text: string) => ({ data: { messages: [{ id: text, role: "assistant", content: text, timestamp: new Date().toISOString() }], last_mode: "roleplay", narrative: null }, error: null });

beforeEach(() => {
  localStorage.clear();
  state.adultEnabled = false; state.consentGiven = false; state.callProps.mockReset();
  state.loads = {};
  state.reply.mockReset(); state.save.mockReset(); state.remove.mockReset(); state.speech.mockReset();
  state.speech.mockReturnValue({ done: Promise.resolve(), stop: vi.fn() });
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});

it("does not carry A messages into B while B's saved session is loading", async () => {
  const b = deferred<unknown>();
  state.loads.a = Promise.resolve(session("Recuerdo exclusivo A."));
  state.loads.b = b.promise;
  render(<MemoryRouter initialEntries={["/story/a"]}><Harness /></MemoryRouter>);
  await screen.findByText("Recuerdo exclusivo A.");
  fireEvent.click(screen.getByText("Abrir B"));
  expect(screen.queryByText("Recuerdo exclusivo A.")).not.toBeInTheDocument();
  await act(async () => b.resolve(session("Recuerdo exclusivo B.")));
  await screen.findByText("Recuerdo exclusivo B.");
  expect(state.save).not.toHaveBeenCalled();
});

it("a reply completed after reset is neither displayed, saved nor spoken", async () => {
  const reply = deferred<unknown>();
  state.loads.a = Promise.resolve(session("Recuerdo exclusivo A."));
  state.reply.mockReturnValue(reply.promise);
  render(<MemoryRouter initialEntries={["/story/a"]}><Harness /></MemoryRouter>);
  await screen.findByText("Recuerdo exclusivo A.");
  fireEvent.change(screen.getByPlaceholderText("story.typeMessage"), { target: { value: "¿Qué recuerdas?" } });
  fireEvent.click(screen.getByText("story.send"));
  await waitFor(() => expect(state.reply).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByTitle("Reiniciar y borrar la conversación"));
  await waitFor(() => expect(state.remove).toHaveBeenCalled());
  await act(async () => reply.resolve({ data: { content: "Respuesta antigua tardía." }, error: null }));
  expect(screen.queryByText("Respuesta antigua tardía.")).not.toBeInTheDocument();
  expect(state.save).not.toHaveBeenCalled();
  expect(state.speech).not.toHaveBeenCalled();
});

it("does not overwrite saved memory when the history lookup fails", async () => {
  state.loads.a = Promise.resolve({ data: null, error: { message: "temporary storage outage" } });
  render(<MemoryRouter initialEntries={["/story/a"]}><Harness /></MemoryRouter>);
  fireEvent.click(screen.getByText("mode.roleplay"));
  await screen.findByRole("alert");
  expect(screen.getByPlaceholderText("story.typeMessage")).toBeDisabled();
  expect(state.save).not.toHaveBeenCalled();
  expect(state.reply).not.toHaveBeenCalled();
  state.loads.a = Promise.resolve(session("Memoria recuperada."));
  fireEvent.click(screen.getByText("Reintentar"));
  await screen.findByText("Memoria recuperada.");
  expect(screen.getByPlaceholderText("story.typeMessage")).not.toBeDisabled();
});

it('a recovered profile cannot override an enabled and consented mode', async () => {
  state.adultEnabled = true; state.consentGiven = true;
  localStorage.setItem('insomnia_story_ai_settings_a', JSON.stringify({ modelId: 'magnum-conversation', adultMode: false, nonExplicitConversation: true }));
  state.loads.a = Promise.resolve(session('Sesion de prueba de configuracion.'));
  state.reply.mockResolvedValue({ data: { content: 'Podemos revisar el proyecto mañana.' }, error: null });
  render(<MemoryRouter initialEntries={['/story/a']}><Harness /></MemoryRouter>);
  await screen.findByText('Sesion de prueba de configuracion.');
  fireEvent.change(screen.getByPlaceholderText('story.typeMessage'), { target: { value: 'Revisamos el proyecto mañana?' } });
  fireEvent.click(screen.getByText('story.send'));
  await waitFor(() => expect(state.reply).toHaveBeenCalledTimes(1));
  const request = state.reply.mock.calls[0][1];
  expect(request.adultMode).toBe(true);
  expect(request.settings.adultMode).toBe(true);
  expect(request.settings.modelId).not.toBe('magnum-conversation');
  expect(state.callProps.mock.lastCall?.[0].adultMode).toBe(true);
});
it('a normal conversation returns to the Gemini configuration', async () => {
  localStorage.setItem('insomnia_story_ai_settings_a', JSON.stringify({ modelId: 'magnum-conversation', nonExplicitConversation: true }));
  state.loads.a = Promise.resolve(session('Conversacion normal de prueba.'));
  state.reply.mockResolvedValue({ data: { content: 'Claro, revisamos el proyecto mañana.' }, error: null });
  render(<MemoryRouter initialEntries={['/story/a']}><Harness /></MemoryRouter>);
  await screen.findByText('Conversacion normal de prueba.');
  fireEvent.change(screen.getByPlaceholderText('story.typeMessage'), { target: { value: 'Revisamos el proyecto mañana?' } });
  fireEvent.click(screen.getByText('story.send'));
  await waitFor(() => expect(state.reply).toHaveBeenCalledTimes(1));
  const request = state.reply.mock.calls[0][1];
  expect(request.adultMode).toBe(false);
  expect(request.settings.modelId).toBe('insomnia-flash');
});
