import { useEffect, useRef, useState } from "react";
import { Phone, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { startWavRecording, blobToBase64, type WavRecorder } from "@/lib/wavRecorder";

type CallState = "idle" | "listening" | "thinking" | "speaking";

interface Turn {
  role: "user" | "assistant";
  content: string;
}

interface CallDialogProps {
  story: any;
  language: string;
  voice: string;
  history: Turn[];
  onTurn: (userText: string, assistantText: string) => void;
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
  history,
  onTurn,
}: CallDialogProps) => {
  const es = language === "es";
  const [state, setState] = useState<CallState>("idle");
  const recorderRef = useRef<WavRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
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
    setState("idle");
  };

  useEffect(() => hangUp, []);

  const speakWithDevice = (text: string) =>
    new Promise<void>((resolve) => {
      if (!("speechSynthesis" in window)) {
        resolve();
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text.replace(/[*_#`\"]/g, ""));
      utterance.lang = es ? "es-ES" : "en-US";
      utterance.rate = 0.98;
      utterance.pitch = 1.1;
      const wantMale = voiceGender(voice) === "male";
      utterance.pitch = wantMale ? 0.9 : 1.1;
      const hints = wantMale
        ? ["male", "hombre", "diego", "jorge", "carlos", "pablo", "enrique", "george", "daniel", "fred"]
        : ["female", "mujer", "femenina", "monica", "mónica", "paulina", "lucia", "helena", "samantha", "sabina", "elvira", "zira"];
      const voices = window.speechSynthesis.getVoices();
      const pool = voices.filter((item) => item.lang.toLowerCase().startsWith(es ? "es" : "en"));
      const candidates = pool.length ? pool : voices;
      const matchingVoice =
        candidates.find((item) => hints.some((hint) => item.name.toLowerCase().includes(hint))) ||
        candidates[0];
      if (matchingVoice) utterance.voice = matchingVoice;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });

  const speak = async (text: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("text-to-speech", {
        body: { text, voice },
      });
      const audioContent = (data as any)?.audioContent as string | undefined;
      if (error || !audioContent) {
        await speakWithDevice(text);
        return;
      }

      const audioUrl = audioUrlFromBase64(
        audioContent,
        ((data as any)?.mimeType as string | undefined) || "audio/wav",
      );
      audioUrlRef.current = audioUrl;
      await new Promise<void>((resolve, reject) => {
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        audio.preload = "auto";
        audio.volume = 1;
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error("audio_playback_failed"));
        audio.play().catch(reject);
      });
      stopSpeaking();
    } catch {
      stopSpeaking();
      await speakWithDevice(text);
    }
  };

  const askCharacter = async (userText: string) => {
    const { data, error } = await supabase.functions.invoke("story-chat", {
      body: {
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
        explicit: story?.story_type === "real_sex" || !!story?.has_explicit_images,
      },
    });
    if (error || !(data as any)?.content) return "";
    return (data as any).content as string;
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
    const blob = await recorder.stop();
    if (!activeRef.current) return;

    if (blob.size < 4096) {
      void listen();
      return;
    }

    const audio = await blobToBase64(blob);
    const { data, error } = await supabase.functions.invoke("speech-to-text", {
      body: { audio, mimeType: "audio/wav", language: es ? "es" : "en" },
    });
    const userText = ((data as any)?.text || "").trim();
    if (error || !userText) {
      if (activeRef.current) void listen();
      return;
    }

    const reply = await askCharacter(userText);
    if (!activeRef.current) return;
    if (!reply) {
      toast({
        title: es ? "El personaje no pudo responder" : "The character could not answer",
        variant: "destructive",
      });
      void listen();
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