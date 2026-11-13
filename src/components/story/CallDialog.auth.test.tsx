import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), toast: vi.fn(), record: vi.fn(), stop: vi.fn(), cancel: vi.fn() }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ t: (key: string) => key }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: mocks.toast }));
vi.mock("@/lib/invokeFunction", () => ({ invokeFunctionWithRetry: mocks.invoke }));
vi.mock("@/lib/wavRecorder", () => ({ startWavRecording: mocks.record, blobToBase64: async () => "recorded-audio" }));
vi.mock("@/lib/ttsStream", () => ({ streamSpeech: vi.fn() }));
vi.mock("@/lib/roleplayBase", () => ({ getMotherCardConfig: () => ({ aiSettings: {}, masterDirective: "Conserva la historia." }) }));
vi.mock("@/lib/storyAiSettings", async (importOriginal) => ({ ...await importOriginal() as Record<string, unknown>, getStoryAiSettings: () => ({}) }));
import { CallDialog } from "./CallDialog";

beforeEach(() => {
  vi.useFakeTimers(); mocks.invoke.mockReset(); mocks.toast.mockReset(); mocks.record.mockReset(); mocks.cancel.mockReset();
  mocks.stop.mockReset().mockResolvedValue(new Blob([new Uint8Array(8000)], { type: "audio/wav" }));
  mocks.record.mockResolvedValue({ stop: mocks.stop, cancel: mocks.cancel, heardSpeech: () => true, getLevel: () => 0 });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it.each(["transcription", "reply"])("stops the microphone loop after unrecoverable authentication during %s", async (stage) => {
  mocks.invoke.mockImplementation(async (name) => name === "speech-to-text" && stage === "reply"
    ? { data: { text: "Hola, soy Ana." }, error: null }
    : { data: { error: "login_required" }, error: { message: "login_required", context: new Response(null, { status: 401 }) } });
  const onTurn = vi.fn();
  render(<CallDialog story={{ id: "card-a", character_role: "Guía", player_role: "Visitante" }} language="es" voice="Aoede" region="plain" adultMode={false} history={[]} onTurn={onTurn} />);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "call.startCall" })));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Enviar voz" })));
  expect(screen.getByRole("button", { name: "call.startCall" })).toBeInTheDocument();
  expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Tu sesión ha caducado" }));
  await act(async () => { vi.advanceTimersByTime(30000); });
  expect(mocks.record).toHaveBeenCalledTimes(1);
  expect(mocks.invoke).toHaveBeenCalledTimes(stage === "reply" ? 2 : 1);
  expect(onTurn).not.toHaveBeenCalledWith(expect.anything(), expect.any(String));
});

it.each(['adult_age_required', 'adult_consent_required', 'adult_not_eligible'])('stops the call loop and displays the access reason for %s', async code => {
  mocks.invoke.mockImplementation(async name => name === 'speech-to-text'
    ? { data: { text: 'Confirmamos el plan de mañana.' }, error: null }
    : { data: { error: code, message: 'Revisa los datos de acceso de tu cuenta.' }, error: { message: code, context: new Response(null, { status: 403 }) } });
  render(<CallDialog story={{ id: 'card-a', character_role: 'Ana, adulta', player_role: 'Visita adulta' }} language="es" voice="Aoede" region="plain" adultMode={true} adultConsent={true} history={[]} onTurn={vi.fn()} />);
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'call.startCall' })));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Enviar voz' })));
  expect(screen.getByRole('button', { name: 'call.startCall' })).toBeInTheDocument();
  expect(mocks.invoke.mock.calls[1][1].adultConsent).toBe(true);
  expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Revisa los datos de acceso de tu cuenta.' }));
  await act(async () => { vi.advanceTimersByTime(30000); });
  expect(mocks.record).toHaveBeenCalledTimes(1);
});
