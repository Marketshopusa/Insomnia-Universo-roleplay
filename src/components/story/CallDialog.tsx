import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Mic, PhoneOff, Loader2, Volume2, VolumeX, Square } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { startWavRecording, blobToBase64, type WavRecorder } from "@/lib/wavRecorder";

type CallState = "idle" | "listening" | "thinking" | "speaking";

interface Turn {
  role: "user" | "assistant";
  content: string;
}

interface CallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  story: any;
  language: string;
  voice: string;
  characterName: string;
  history: Turn[];
  onTurn: (userText: string, assistantText: string) => void;
}

const SILENCE_MS = 1400;
const MAX_TURN_MS = 30000;

export const CallDialog = ({
  open,
  onOpenChange,
  story,
  language,
  voice,
  characterName,
  history,
  onTurn,
}: CallDialogProps) => {
  const es = language === "es";
  const [state, setState] = useState<CallState>("idle");
  const [muted, setMuted] = useState(false);
  const [lastUser, setLastUser] = useState("");
  const [lastReply, setLastReply] = useState("");
  const [level, setLevel] = useState(0);

  const recorderRef = useRef<WavRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const historyRef = useRef<Turn[]>(history);
  const activeRef = useRef(false);
  const timersRef = useRef<number[]>([]);

  useEffect(() => { historyRef.current = history; }, [history]);

  const clearTimers = () => {
    timersRef.current.forEach((id) => window.clearInterval(id));
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  };

  const stopSpeaking = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  };

  const hangUp = () => {
    activeRef.current = false;
    clearTimers();
    stopSpeaking();
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setState("idle");
    setLevel(0);
    onOpenChange(false);
  };

  useEffect(() => {
    if (!open) hangUp();
    return () => {
      activeRef.current = false;
      clearTimers();
      stopSpeaking();
      recorderRef.current?.cancel();
      recorderRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const speak = (text: string) =>
    new Promise<void>((resolve) => {
      if (muted) return resolve();
      const browserFallback = () => {
        try {
          if (!("speechSynthesis" in window)) return resolve();
          window.speechSynthesis.cancel();
          const utter = new SpeechSynthesisUtterance(text.replace(/[*_#`"]/g, ""));
          utter.lang = es ? "es-ES" : "en-US";
          utter.rate = 0.98;
          utter.pitch = 1.1;
          utter.onend = () => resolve();
          utter.onerror = () => resolve();
          window.speechSynthesis.speak(utter);
        } catch {
          resolve();
        }
      };

      supabase.functions
        .invoke("text-to-speech", { body: { text, voice } })
        .then(({ data, error }) => {
          const audioContent = (data as any)?.audioContent;
          if (error || !audioContent) return browserFallback();
          const mime = (data as any)?.mimeType || "audio/wav";
          const audio = new Audio(`data:${mime};base64,${audioContent}`);
          audioRef.current = audio;
          audio.onended = () => resolve();
          audio.onerror = () => browserFallback();
          audio.play().catch(() => browserFallback());
        })
        .catch(() => browserFallback());
    });

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

  const finishTurn = async () => {
    const rec = recorderRef.current;
    recorderRef.current = null;
    clearTimers();
    if (!rec) return;
    setLevel(0);
    setState("thinking");
    const blob = await rec.stop();
    if (!activeRef.current) return;

    if (blob.size < 4096) {
      if (activeRef.current) listen();
      return;
    }

    const audio64 = await blobToBase64(blob);
    const { data, error } = await supabase.functions.invoke("speech-to-text", {
      body: { audio: audio64, mimeType: "audio/wav", language: es ? "es" : "en" },
    });
    const userText = ((data as any)?.text || "").trim();
    if (error || !userText) {
      if (activeRef.current) listen();
      return;
    }
    setLastUser(userText);

    const reply = await askCharacter(userText);
    if (!activeRef.current) return;
    if (!reply) {
      toast({
        title: es ? "El personaje no pudo responder" : "The character could not answer",
        variant: "destructive",
      });
      if (activeRef.current) listen();
      return;
    }
    setLastReply(reply);
    historyRef.current = [
      ...historyRef.current,
      { role: "user", content: userText },
      { role: "assistant", content: reply },
    ];
    onTurn(userText, reply);

    setState("speaking");
    await speak(reply);
    if (activeRef.current) listen();
  };

  const listen = async () => {
    try {
      activeRef.current = true;
      stopSpeaking();
      setState("listening");
      const rec = await startWavRecording();
      recorderRef.current = rec;

      let silentFor = 0;
      let heardVoice = false;
      const meter = window.setInterval(() => {
        const l = rec.getLevel();
        setLevel(l);
        if (l > 0.035) {
          heardVoice = true;
          silentFor = 0;
        } else {
          silentFor += 150;
        }
        if (heardVoice && silentFor >= SILENCE_MS) {
          window.clearInterval(meter);
          finishTurn();
        }
      }, 150);
      timersRef.current.push(meter);

      const maxTimer = window.setTimeout(() => {
        window.clearInterval(meter);
        finishTurn();
      }, MAX_TURN_MS);
      timersRef.current.push(maxTimer);
    } catch {
      setState("idle");
      toast({
        title: es ? "Necesito acceso al micrófono" : "Microphone access is needed",
        description: es
          ? "Permite el micrófono en tu navegador para usar la llamada."
          : "Allow the microphone in your browser to use the call.",
        variant: "destructive",
      });
    }
  };

  const interrupt = () => {
    stopSpeaking();
    clearTimers();
    recorderRef.current?.cancel();
    recorderRef.current = null;
    listen();
  };

  const label =
    state === "listening"
      ? es ? "Te escucho…" : "Listening…"
      : state === "thinking"
      ? es ? "Pensando…" : "Thinking…"
      : state === "speaking"
      ? es ? "Hablando" : "Speaking"
      : es ? "Llamada lista" : "Call ready";

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : hangUp())}>
      <DialogContent className="sm:max-w-md rounded-none border-border">
        <div className="flex flex-col items-center text-center gap-5 py-4">
          <div className="relative">
            <div
              className="w-28 h-28 border border-primary/50 bg-secondary flex items-center justify-center"
              style={{
                boxShadow:
                  state === "listening"
                    ? `0 0 ${10 + level * 120}px hsl(var(--primary) / 0.5)`
                    : state === "speaking"
                    ? "0 0 30px hsl(var(--accent) / 0.45)"
                    : "none",
              }}
            >
              {state === "thinking" ? (
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
              ) : state === "speaking" ? (
                <Volume2 className="w-10 h-10 text-accent" />
              ) : (
                <Mic className="w-10 h-10 text-primary" />
              )}
            </div>
          </div>

          <div>
            <h3 className="font-display text-xl">{characterName}</h3>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>

          <div className="w-full text-left space-y-2 min-h-[72px]">
            {lastUser && (
              <p className="text-xs text-muted-foreground">
                <span className="text-primary">{es ? "Tú" : "You"}: </span>
                {lastUser}
              </p>
            )}
            {lastReply && (
              <p className="text-sm text-foreground">
                <span className="text-accent">{characterName}: </span>
                {lastReply}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {state === "idle" ? (
              <Button onClick={listen} className="gap-2 rounded-none">
                <Mic className="w-4 h-4" />
                {es ? "Iniciar llamada" : "Start call"}
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={interrupt} className="gap-2 rounded-none">
                  <Square className="w-4 h-4" />
                  {es ? "Interrumpir" : "Interrupt"}
                </Button>
                {state === "listening" && (
                  <Button variant="outline" onClick={finishTurn} className="gap-2 rounded-none">
                    {es ? "Enviar turno" : "Send turn"}
                  </Button>
                )}
              </>
            )}
            <Button
              variant="outline"
              onClick={() => {
                setMuted((m) => !m);
                stopSpeaking();
              }}
              className="gap-2 rounded-none"
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              {muted ? (es ? "Sin voz" : "Muted") : (es ? "Con voz" : "Voice on")}
            </Button>
            <Button variant="destructive" onClick={hangUp} className="gap-2 rounded-none">
              <PhoneOff className="w-4 h-4" />
              {es ? "Colgar" : "Hang up"}
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground">
            {es
              ? "Habla y haz una pausa: el personaje te responderá con voz."
              : "Speak and pause: the character will answer with voice."}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
