import { useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, Mic, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "@/hooks/use-toast";
import { startWavRecording, blobToBase64, type WavRecorder } from "@/lib/wavRecorder";
import { streamSpeech, type SpeechStream } from "@/lib/ttsStream";
import { browserSpeechLocale } from "@/lib/regions";
import { invokeFunctionWithRetry } from "@/lib/invokeFunction";
import { normalizeAssistantReply } from "@/lib/roleReply";
import { selectStoryMemory } from "@/lib/storyMemory";

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
  onend: (() => void) | null;
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

const SILENCE_MS = 1600;
const MAX_TURN_MS = 25000;

export const CallDialog = ({
  story,
  language,
  voice,
  region,
  adultMode,
  history,
  onTurn,
}: CallDialogProps) => {
  const { t } = useLanguage();
  const es = language === "es";
  const [state, setState] = useState<CallState>("idle");
  const [liveTranscript, setLiveTranscript] = useState("");
  const recorderRef = useRef<WavRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const streamRef = useRef<SpeechStream | null>(null);
  const historyRef = useRef<Turn[]>(history);
  const activeRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const sessionCountRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
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
  };

  const hangUp = () => {
    activeRef.current = false;
    sessionCountRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    clearTimers();
    stopSpeaking();
    recorderRef.current?.cancel();
    recorderRef.current = null;
    try { recognitionRef.current?.abort(); } catch { /* noop */ }
    recognitionRef.current = null;
    transcriptRef.current = "";
    setLiveTranscript("");
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
          id: story?.id,
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
    return { content: normalizeAssistantReply(data.content) || data.content, error: undefined, message: undefined };
  };

  const recoverTurn = () => {
    if (!activeRef.current) return;
    toast({
      title: t("call.interrupted"),
      description: t("call.interruptedDesc"),
      variant: "destructive",
    });
    void listen();
  };

  const listen = async () => {
    try {
      activeRef.current = true;
      stopSpeaking();
      transcriptRef.current = "";
      setLiveTranscript("");
      setState("listening");
      const recorder = await startWavRecording();
      if (!activeRef.current) {
        recorder.cancel();
        return;
      }
      recorderRef.current = recorder;

      let silentFor = 0;
      let heardVoice = false;
      let peakLevel = 0;
      let lastSpeechChangeAt = Date.now();
      let hasFinalResult = false;

      // Restore original Lovable Browser SpeechRecognition for instant real-time transcription
      const browser = window as Window & {
        SpeechRecognition?: new () => BrowserRecognition;
        webkitSpeechRecognition?: new () => BrowserRecognition;
      };
      const Recognition = browser.SpeechRecognition || browser.webkitSpeechRecognition;
      if (Recognition) {
        try {
          const recognition = new Recognition();
          recognition.lang = browserSpeechLocale(language, region);
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.onresult = (event) => {
            const resultsArr = Array.from(event.results);
            const text = resultsArr
              .map((result) => result[0]?.transcript || "")
              .join(" ")
              .trim();
            if (text) {
              if (text !== transcriptRef.current) {
                lastSpeechChangeAt = Date.now();
              }
              transcriptRef.current = text;
              setLiveTranscript(text);
              heardVoice = true;
              silentFor = 0;
              const lastResult = resultsArr[resultsArr.length - 1];
              hasFinalResult = Boolean(lastResult?.isFinal);
            }
          };
          recognition.onerror = () => {
            if (recognitionRef.current === recognition) recognitionRef.current = null;
          };
          recognition.onend = () => {
            if (activeRef.current && recognitionRef.current === recognition && recorderRef.current) {
              try { recognition.start(); } catch { recognitionRef.current = null; }
            }
          };
          recognition.start();
          recognitionRef.current = recognition;
        } catch {
          recognitionRef.current = null;
        }
      }

      const meter = window.setInterval(() => {
        const level = recorder.getLevel();
        if (level > peakLevel) peakLevel = level;
        const activeThreshold = Math.max(0.007, Math.min(0.02, peakLevel * 0.20));
        if (level > activeThreshold) {
          heardVoice = true;
          silentFor = 0;
        } else {
          silentFor += 150;
        }
        const hasTranscript = transcriptRef.current.trim().length > 0;
        const msSinceTranscriptChange = Date.now() - lastSpeechChangeAt;
        const transcriptDone = hasTranscript && (
          (silentFor >= 1200 && ((hasFinalResult && msSinceTranscriptChange >= 1400) || msSinceTranscriptChange >= 1800)) ||
          (silentFor >= 800 && msSinceTranscriptChange >= 2200) ||
          (hasTranscript && silentFor >= SILENCE_MS)
        );
        if (transcriptDone || (heardVoice && silentFor >= SILENCE_MS)) {
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
        title: t("call.micRequired"),
        description: t("call.micRequiredDesc"),
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

    const activeRecognition = recognitionRef.current;
    recognitionRef.current = null;
    try { activeRecognition?.stop(); } catch { /* noop */ }

    const spoke = recorder.heardSpeech();
    const blob = await recorder.stop();
    if (!activeRef.current) return;

    // Brief 180ms grace period for browser SpeechRecognition to flush its final word after stop()
    if (!transcriptRef.current.trim() && activeRecognition) {
      await new Promise((r) => window.setTimeout(r, 180));
    }

    let userText = transcriptRef.current.trim();
    transcriptRef.current = "";
    setLiveTranscript("");

    const turnSession = sessionCountRef.current;
    abortControllerRef.current = new AbortController();

    // If browser SpeechRecognition did not produce text, fall back to server WAV transcription
    if (!userText) {
      if (!spoke && blob.size < 4096) {
        if (activeRef.current && sessionCountRef.current === turnSession) void listen();
        return;
      }

      const audio = await blobToBase64(blob);
      if (!activeRef.current || sessionCountRef.current !== turnSession) return;

      const { data, error } = await invokeFunctionWithRetry<{ text?: string; error?: string; message?: string; details?: string }>("speech-to-text", {
        audio,
        mimeType: "audio/wav",
        language: es ? "es" : "en",
        region,
      });
      if (!activeRef.current || sessionCountRef.current !== turnSession) return;

      if (error || data?.error) {
        toast({
          title: t("call.cantTranscribe"),
          description: data?.message || error?.message || t("call.noVoice"),
          variant: "destructive",
        });
        if (activeRef.current && sessionCountRef.current === turnSession) void listen();
        return;
      }
      userText = (data?.text || "").trim();
    }

    if (!userText) {
      if (activeRef.current && sessionCountRef.current === turnSession) void listen();
      return;
    }

    const priorHistory = historyRef.current.slice();
    onTurn(userText, null);
    const replyResult = await askCharacter(userText, priorHistory);
    if (!activeRef.current || sessionCountRef.current !== turnSession) return;
    const reply = replyResult.content;
    if (!reply) {
      historyRef.current = [...priorHistory, { role: "user", content: userText }];
      toast({
        title: replyResult.error === "credits_exhausted"
          ? (es ? "Se agotaron los creditos de IA" : "AI credits are exhausted")
          : replyResult.error === "content_blocked"
            ? (es ? "Esta escena no puede continuar" : "This scene cannot continue")
            : t("call.charFailed"),
        description: replyResult.message || t("call.savedMessage"),
        variant: "destructive",
      });
      if (replyResult.error === "credits_exhausted" || replyResult.error === "content_blocked") {
        hangUp();
      } else {
        if (activeRef.current && sessionCountRef.current === turnSession) void listen();
      }
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
    if (activeRef.current && sessionCountRef.current === turnSession) void listen();
  };

  const active = state !== "idle";
  const status = state === "listening"
    ? (liveTranscript ? liveTranscript : (es ? "Escuchando... habla ahora" : "Listening... speak now"))
    : state === "thinking"
      ? t("call.answering")
      : state === "speaking"
        ? t("call.speaking")
        : "";

  const handleActionClick = () => {
    if (!active) {
      void listen();
    } else if (state === "listening") {
      void finishTurn().catch(recoverTurn);
    } else if (state === "speaking") {
      stopSpeaking();
      void listen();
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      {status && <span className="text-xs text-muted-foreground animate-pulse max-w-[150px] truncate">{status}</span>}
      <Button
        type="button"
        size="icon"
        onClick={handleActionClick}
        disabled={state === "thinking"}
        className={`h-10 w-10 shrink-0 rounded-full border transition-all sm:h-11 sm:w-11 ${
          active
            ? "border-call-active/60 bg-call-active text-call-active-foreground hover:bg-call-active/90 ring-2 ring-call-active/30"
            : "border-call-inactive/60 bg-call-inactive text-call-inactive-foreground hover:bg-call-inactive/90"
        }`}
        aria-label={active ? (state === "listening" ? (es ? "Enviar voz" : "Send voice") : t("call.endCall")) : t("call.startCall")}
        title={active ? (state === "listening" ? (es ? "Toca para enviar ya" : "Tap to send now") : (es ? "Hablar" : "Speak")) : t("call.startCall")}
      >
        {state === "thinking" ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : state === "listening" ? (
          <Mic className="h-5 w-5 animate-pulse" />
        ) : (
          <Phone className={`h-5 w-5 ${active ? "animate-pulse" : ""}`} />
        )}
      </Button>
      {active && (
        <Button
          type="button"
          size="icon"
          variant="destructive"
          onClick={hangUp}
          className="h-9 w-9 shrink-0 rounded-full sm:h-10 sm:w-10"
          aria-label={t("call.endCall")}
          title={t("call.endCall")}
        >
          <PhoneOff className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
};