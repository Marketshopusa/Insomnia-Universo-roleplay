import { useEffect, useRef, useState } from "react";
import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";

import { toast } from "@/hooks/use-toast";
import { startWavRecording, blobToBase64, type WavRecorder } from "@/lib/wavRecorder";
import { streamSpeech, type SpeechStream } from "@/lib/ttsStream";
import { invokeFunctionWithRetry } from "@/lib/invokeFunction";
import { selectStoryMemory } from "@/lib/storyMemory";

type CallState = "idle" | "listening" | "thinking" | "speaking";

interface Turn {
  role: "user" | "assistant";
  content: string;
}

interface CallDialogProps {
  story: any;
  language: string;
  voice: string;
  region: string;
  adultMode: boolean;
  history: Turn[];
  onTurn: (userText: string, assistantText: string | null) => void;
}

const SILENCE_MS = 1400;
const MAX_TURN_MS = 30000;

function audioUrlFromBase64(content: string, mimeType: string) {
  const binary = window.atob(content);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

export const CallDialog = ({
  story,
  language,
  voice,
  region,
  adultMode,
  history,
  onTurn,
}: CallDialogProps) => {
  const es = language === "es";
  const [state, setState] = useState<CallState>("idle");
  const recorderRef = useRef<WavRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const streamRef = useRef<SpeechStream | null>(null);
  const historyRef = useRef<Turn[]>(history);
  const activeRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  const clearTimers = () => {
    timersRef.current.forEach((id) => window.clearInterval(id));
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  };

  const stopSpeaking = () => {
    streamRef.current?.stop();
    streamRef.current = null;
    audioRef.current?.pause();
    audioRef.current = null;
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  };

  const hangUp = () => {
    activeRef.current = false;
    clearTimers();
    stopSpeaking();
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setState("idle");
  };

  useEffect(() => hangUp, []);

  const speak = async (text: string) => {
    try {
      const speech = streamSpeech(text, voice, language, true, region);
      streamRef.current = speech;
      await speech.done;
      streamRef.current = null;
    } catch (error) {
      streamRef.current?.stop();
      streamRef.current = null;
      const message = error instanceof Error ? error.message : "";
      toast({
        title: es ? "Gemini 2.5 no pudo hablar" : "Gemini 2.5 could not speak",
        description: message || (es ? "La voz no respondió." : "The voice did not answer."),
        variant: "destructive",
      });
      hangUp();
    }
  };

  const askCharacter = async (userText: string, priorHistory: Turn[]) => {
    const { data, error } = await invokeFunctionWithRetry<{ content?: string; error?: string; message?: string }>("story-chat", {
        story: {
          title: story?.title,
          description: story?.description,
          story_context: story?.story_context,
          character_role: story?.character_role,
          player_role: story?.player_role,
          story_type: story?.story_type,
        },
        language,
        history: priorHistory.slice(-48),
        memory: selectStoryMemory(priorHistory, userText),
        userMessage: userText,
        adultMode,
        region,
    });
    if (error || !data?.content) {
      const status = (error as { context?: Response } | null)?.context?.status;
      if (status === 402 || data?.error === "credits_exhausted") {
        return {
          content: "", error: "credits_exhausted",
          message: es
            ? "El proveedor de IA no tiene creditos para responder."
            : "The AI provider has no credits to respond.",
        };
      }
      return { content: "", error: data?.error, message: data?.message };
    }
    return { content: data.content, error: undefined, message: undefined };
  };

  const recoverTurn = () => {
    if (!activeRef.current) return;
    toast({
      title: es ? "Se interrumpió la llamada" : "The call was interrupted",
      description: es ? "La llamada sigue abierta. Vuelve a hablar." : "The call remains open. Speak again.",
      variant: "destructive",
    });
    void listen();
  };

  const listen = async () => {
    try {
      activeRef.current = true;
      stopSpeaking();
      setState("listening");
      const recorder = await startWavRecording();
      if (!activeRef.current) {
        recorder.cancel();
        return;
      }
      recorderRef.current = recorder;

      let silentFor = 0;
      let heardVoice = false;
      const meter = window.setInterval(() => {
        const level = recorder.getLevel();
        if (level > 0.012) {
          heardVoice = true;
          silentFor = 0;
        } else {
          silentFor += 150;
        }
        if (heardVoice && silentFor >= SILENCE_MS) {
          window.clearInterval(meter);
          void finishTurn().catch(recoverTurn);
        }
      }, 150);
      timersRef.current.push(meter);

      const maxTimer = window.setTimeout(() => {
        window.clearInterval(meter);
        void finishTurn().catch(recoverTurn);
      }, MAX_TURN_MS);
      timersRef.current.push(maxTimer);
    } catch {
      hangUp();
      toast({
        title: es ? "Necesito acceso al micrófono" : "Microphone access is needed",
        description: es
          ? "Permite el micrófono en tu navegador para usar la llamada."
          : "Allow the microphone in your browser to use the call.",
        variant: "destructive",
      });
    }
  };

  const finishTurn = async () => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    clearTimers();
    if (!recorder) return;
    setState("thinking");
    const spoke = recorder.heardSpeech();
    const blob = await recorder.stop();
    if (!activeRef.current) return;

    if (!spoke || blob.size < 4096) {
      void listen();
      return;
    }

    const audio = await blobToBase64(blob);
    const { data, error } = await invokeFunctionWithRetry<{ text?: string; error?: string; message?: string }>("speech-to-text", { audio, mimeType: "audio/wav", language: es ? "es" : "en", region });
    const userText = (data?.text || "").trim();
    if (error || data?.error) {
      toast({
        title: es ? "No se pudo transcribir la llamada" : "Could not transcribe the call",
        description: data?.message || error?.message || (es
          ? "No llegó la voz del micrófono. La llamada sigue abierta: habla de nuevo."
          : "The microphone audio did not arrive. The call stays open: speak again."),
        variant: "destructive",
      });
      if (activeRef.current) void listen();
      return;
    }
    if (!userText) {
      if (activeRef.current) void listen();
      return;
    }

    const priorHistory = historyRef.current.slice();
    onTurn(userText, null);
    const replyResult = await askCharacter(userText, priorHistory);
    const reply = replyResult.content;
    if (!activeRef.current) return;
    if (!reply) {
      historyRef.current = [...priorHistory, { role: "user", content: userText }];
      toast({
        title: replyResult.error === "credits_exhausted"
          ? (es ? "Se agotaron los creditos de IA" : "AI credits are exhausted")
          : replyResult.error === "content_blocked"
            ? (es ? "Esta escena no puede continuar" : "This scene cannot continue")
            : (es ? "El personaje no pudo responder" : "The character could not answer"),
        description: replyResult.message || (es
          ? "Guardamos lo que dijiste. La llamada continuará escuchando."
          : "What you said was saved. The call will keep listening."),
        variant: "destructive",
      });
      if (replyResult.error === "credits_exhausted") hangUp();
      else void listen();
      return;
    }

    historyRef.current = [
      ...priorHistory,
      { role: "user", content: userText },
      { role: "assistant", content: reply },
    ];
    onTurn(userText, reply);
    setState("speaking");
    await speak(reply);
    if (activeRef.current) void listen();
  };

  const active = state !== "idle";
  const status = state === "listening"
    ? (es ? "Escuchando" : "Listening")
    : state === "thinking"
      ? (es ? "Respondiendo" : "Answering")
      : state === "speaking"
        ? (es ? "Hablando" : "Speaking")
        : "";

  return (
    <div className="flex items-center gap-2">
      {status && <span className="text-xs text-muted-foreground">{status}</span>}
      <Button
        type="button"
        size="icon"
        onClick={() => (active ? hangUp() : void listen())}
        className={`h-10 w-10 shrink-0 rounded-full border transition-colors sm:h-11 sm:w-11 ${
          active
            ? "border-call-active/60 bg-call-active text-call-active-foreground hover:bg-call-active/90"
            : "border-call-inactive/60 bg-call-inactive text-call-inactive-foreground hover:bg-call-inactive/90"
        }`}
        aria-label={active ? (es ? "Colgar llamada" : "Hang up call") : (es ? "Iniciar llamada" : "Start call")}
        title={active ? (es ? "Colgar llamada" : "Hang up call") : (es ? "Iniciar llamada" : "Start call")}
      >
        <Phone className={`h-5 w-5 ${active ? "animate-pulse" : ""}`} />
      </Button>
    </div>
  );
};