import { useEffect, useRef, useState } from "react";
import { Phone, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";

import { toast } from "@/hooks/use-toast";
import { startWavRecording, blobToBase64, type WavRecorder } from "@/lib/wavRecorder";
import { streamSpeech, type SpeechStream } from "@/lib/ttsStream";
import { regionLocale } from "@/lib/regions";
import { invokeFunctionWithRetry } from "@/lib/invokeFunction";

type CallState = "idle" | "listening" | "thinking" | "speaking";

interface Turn {
  role: "user" | "assistant";
  content: string;
}

interface BrowserRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
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
  const recognitionRef = useRef<BrowserRecognition | null>(null);
  const transcriptRef = useRef("");

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
    window.speechSynthesis?.cancel();
  };

  const hangUp = () => {
    activeRef.current = false;
    clearTimers();
    stopSpeaking();
    recorderRef.current?.cancel();
    recorderRef.current = null;
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    transcriptRef.current = "";
    setState("idle");
  };

  useEffect(() => hangUp, []);

  const speak = async (text: string) => {
    try {
      const speech = streamSpeech(text, voice, language, undefined, true, region);
      streamRef.current = speech;
      await speech.done;
      streamRef.current = null;
    } catch (error) {
      streamRef.current?.stop();
      streamRef.current = null;
      const status = (error as { status?: number })?.status;
      toast({
        title: es ? "La voz Gemini no está disponible" : "Gemini voice is unavailable",
        description: status === 429
          ? (es ? "Se alcanzó la cuota de voces. Puedes seguir por texto." : "The voice quota has been reached. You can continue by text.")
          : (es ? "No se pudo reproducir la voz seleccionada." : "The selected voice could not play."),
        variant: "destructive",
      });
      hangUp();
    }
  };

  const askCharacter = async (userText: string) => {
    const { data, error } = await invokeFunctionWithRetry<{ content?: string; error?: string; message?: string }>("story-chat", {
        story: {
          title: story?.title,
          description: story?.description,
          character_role: story?.character_role,
          player_role: story?.player_role,
          story_type: story?.story_type,
        },
        language,
        history: historyRef.current.slice(-12),
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
      transcriptRef.current = "";
      const browser = window as Window & {
        SpeechRecognition?: new () => BrowserRecognition;
        webkitSpeechRecognition?: new () => BrowserRecognition;
      };
      const Recognition = browser.SpeechRecognition || browser.webkitSpeechRecognition;
      if (Recognition) {
        try {
          const recognition = new Recognition();
          recognition.lang = es ? regionLocale(region) : "en-US";
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.onresult = (event) => {
            transcriptRef.current = Array.from(event.results)
              .map((result) => result[0]?.transcript || "").join(" ").trim();
          };
          recognition.start();
          recognitionRef.current = recognition;
        } catch {
          recognitionRef.current = null;
        }
      }

      let silentFor = 0;
      let heardVoice = false;
      const meter = window.setInterval(() => {
        const level = recorder.getLevel();
        if (level > 0.035) {
          heardVoice = true;
          silentFor = 0;
        } else {
          silentFor += 150;
        }
        if (heardVoice && silentFor >= SILENCE_MS) {
          window.clearInterval(meter);
          void finishTurn();
        }
      }, 150);
      timersRef.current.push(meter);

      const maxTimer = window.setTimeout(() => {
        window.clearInterval(meter);
        void finishTurn();
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
    recognitionRef.current?.stop();
    const blob = await recorder.stop();
    if (!activeRef.current) return;

    if (blob.size < 4096) {
      void listen();
      return;
    }

    let userText = transcriptRef.current.trim();
    recognitionRef.current = null;
    if (!userText) {
      const audio = await blobToBase64(blob);
      const { data, error } = await invokeFunctionWithRetry<{ text?: string; error?: string }>("speech-to-text", { audio, mimeType: "audio/wav", language: es ? "es" : "en", region });
      userText = ((data as any)?.text || "").trim();
      if (error || (data as any)?.error) {
        toast({
          title: es ? "No se pudo transcribir la llamada" : "Could not transcribe the call",
          description: es
            ? "La voz en la nube no esta disponible. Puedes escribir tu mensaje en el chat."
            : "Cloud transcription is unavailable. You can type your message in chat.",
          variant: "destructive",
        });
        hangUp();
        return;
      }
    }
    if (!userText) {
      if (activeRef.current) void listen();
      return;
    }

    const replyResult = await askCharacter(userText);
    const reply = replyResult.content;
    if (!activeRef.current) return;
    if (!reply) {
      historyRef.current = [...historyRef.current, { role: "user", content: userText }];
      onTurn(userText, null);
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
      ...historyRef.current,
      { role: "user", content: userText },
      { role: "assistant", content: reply },
    ];
    onTurn(userText, reply);
    setState("speaking");
    await speak(reply);
    if (activeRef.current) void listen();
  };

  const active = state !== "idle";

  return (
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
      {active ? <PhoneOff className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
    </Button>
  );
};