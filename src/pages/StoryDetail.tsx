 import { useState, useRef, useEffect } from "react";
 import { useParams, useNavigate } from "react-router-dom";
 import { MainLayout } from "@/components/layout/MainLayout";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { Card } from "@/components/ui/card";
 import { Badge } from "@/components/ui/badge";
 import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Send, Play, Image as ImageIcon, Volume2, VolumeX, BookOpen, MessageSquare, Loader2, RotateCw, Sparkles } from "lucide-react";
import { CallDialog } from "@/components/story/CallDialog";
import { STORY_VOICES, getStoryVoice, setStoryVoice, voiceGender } from "@/lib/voices";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
 import { useStory } from "@/hooks/useStories";
 import { useLanguage } from "@/contexts/LanguageContext";
import { useTranslatedTexts, useTranslatedText } from "@/hooks/useTranslatedTexts";
import { useAuth } from "@/contexts/AuthContext";
import { useAdultMode } from "@/contexts/AdultModeContext";
import { AdultConsentDialog } from "@/components/adult/AdultConsentDialog";
import { Lock, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
 
 interface Message {
   id: string;
   role: "user" | "assistant";
   content: string;
   timestamp: Date;
 }

type Mode = "select" | "read" | "roleplay";
 
 const StoryDetail = () => {
   const { storyId } = useParams<{ storyId: string }>();
   const navigate = useNavigate();
  const { t, language } = useLanguage();
  const { user, loading: authLoading } = useAuth();
  const { enabled: adultEnabled, consentGiven, enable, grantConsent } = useAdultMode();
  const [consentOpen, setConsentOpen] = useState(false);
   const { data: story, isLoading } = useStory(storyId || "");
   
   const [messages, setMessages] = useState<Message[]>([]);
   const [inputMessage, setInputMessage] = useState("");
   const [isTyping, setIsTyping] = useState(false);
   const [isMuted, setIsMuted] = useState(false);
   const messagesEndRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<Mode>("select");
  const [narrative, setNarrative] = useState<string>("");
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const [voice, setVoice] = useState<string>(() => getStoryVoice(storyId));
  const voiceRef = useRef<string>(voice);
  const audioCacheRef = useRef<Map<string, string>>(new Map());
  const changeVoice = (value: string) => {
    setVoice(value);
    voiceRef.current = value;
    setStoryVoice(storyId, value);
    audioCacheRef.current.clear();
  };
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
   const audioUnlockedRef = useRef(false);

   // Generated scene illustrations keyed by message id (or "narrative")
   const [sceneImages, setSceneImages] = useState<Record<string, string>>({});
   const [illustratingId, setIllustratingId] = useState<string | null>(null);

   // Unlock audio on first user gesture so later TTS playback isn't blocked by autoplay policy
   useEffect(() => {
     const unlock = () => {
       if (audioUnlockedRef.current) return;
       try {
         const a = new Audio(
           "data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQxAADB8AhKfRgAAEAAAGgAAAAEkVCAUWVFR4kQ4M0gNRMVQA="
         );
         a.volume = 0;
         a.play().then(() => { a.pause(); audioUnlockedRef.current = true; }).catch(() => {});
       } catch {}
     };
     window.addEventListener("click", unlock, { once: false });
     window.addEventListener("touchstart", unlock, { once: false });
     return () => {
       window.removeEventListener("click", unlock);
       window.removeEventListener("touchstart", unlock);
     };
   }, []);

  // Translate dynamic story fields to active language
  const [tTitle, tDescription, tCharacter, tPlayer] = useTranslatedTexts([
    story?.title,
    story?.description,
    story?.character_role,
    story?.player_role,
  ]);

  const categoryNamesAll: string[] =
    story?.story_categories?.map((sc: any) => sc?.categories?.name).filter(Boolean) || [];
  const tCategoryNames = useTranslatedTexts(categoryNamesAll);
 
  // Load saved session for this user + story (persistent history)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!user || !storyId) return;
      const { data, error } = await supabase
        .from("story_sessions")
        .select("messages, narrative, last_mode")
        .eq("user_id", user.id)
        .eq("story_id", storyId)
        .maybeSingle();
      if (cancelled) return;
      if (!error && data) {
        const raw = (data.messages as any[]) || [];
        const restored: Message[] = raw.map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: new Date(m.timestamp),
        }));
        if (restored.length > 0) setMessages(restored);
        if (data.narrative) setNarrative(data.narrative);
        if (data.last_mode === "read" || data.last_mode === "roleplay") {
          setMode(data.last_mode as Mode);
        }
      }
      setSessionLoaded(true);
    };
    load();
    return () => { cancelled = true; };
  }, [user, storyId]);

  // Persist current session (upsert one row per user+story)
  const saveSession = async (
    nextMessages: Message[],
    nextNarrative: string | null,
    nextMode: Mode
  ) => {
    if (!user || !storyId) return;
    const serializable = nextMessages
      .filter((m) => m.id !== "intro")
      .map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp.toISOString(),
      }));
    await supabase.from("story_sessions").upsert(
      {
        user_id: user.id,
        story_id: storyId,
        messages: serializable,
        narrative: nextNarrative,
        last_mode: nextMode,
      },
      { onConflict: "user_id,story_id" }
    );
  };

   const scrollToBottom = () => {
     messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
   };
 
   useEffect(() => {
     scrollToBottom();
   }, [messages]);
 
   // Initialize with story intro message
   useEffect(() => {
     if (story && sessionLoaded && messages.length === 0) {
       const introMessage: Message = {
         id: "intro",
         role: "assistant",
         content: getIntroMessage(story),
         timestamp: new Date(),
       };
       setMessages([introMessage]);
     }
  }, [story, sessionLoaded, language, tTitle, tDescription, tCharacter, tPlayer]);

  // Re-render intro when language changes
  useEffect(() => {
    if (story && messages.length > 0) {
      setMessages((prev) => prev.map((m) =>
        m.id === "intro" ? { ...m, content: getIntroMessage(story) } : m
      ));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, tTitle, tDescription, tCharacter, tPlayer]);
 
   const getIntroMessage = (story: any) => {
    const characterRole = tCharacter || story.character_role || t("chat.char");
    const playerRole = tPlayer || story.player_role || t("chat.you");
    const title = tTitle || story.title;
    const description = tDescription || story.description || t("story.welcome");

    return `*${title}*\n\n${description}\n\n${t("story.youArePlaying")}: **${playerRole}**\n${t("story.iAmPlaying")}: **${characterRole}**\n\n*${t("story.sceneSet")}*`;
   };
 
   const generateResponse = async (userMessage: string) => {
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
        history: messages
          .filter((m) => m.id !== "intro")
          .map((m) => ({ role: m.role, content: m.content })),
        userMessage,
        explicit: story?.story_type === "real_sex" || !!story?.has_explicit_images,
      },
    });
    if (error || !data?.content) {
      const code = (data as any)?.error;
      if (code === "rate_limited") toast({ title: t("mode.rateLimited"), variant: "destructive" });
      else if (code === "credits_exhausted") toast({ title: t("mode.creditsExhausted"), variant: "destructive" });
      else toast({ title: t("mode.aiError"), variant: "destructive" });
      return language === "es"
        ? "*el personaje guarda silencio por un momento*"
        : "*the character pauses for a moment*";
    }
    return data.content as string;
   };
 
   const handleSendMessage = async () => {
     if (!inputMessage.trim()) return;
 
     const userMessage: Message = {
       id: Date.now().toString(),
       role: "user",
       content: inputMessage,
       timestamp: new Date(),
     };
 
     setMessages((prev) => [...prev, userMessage]);
     setInputMessage("");
     setIsTyping(true);
 
 
     const responseContent = await generateResponse(inputMessage);
     
     const assistantMessage: Message = {
       id: (Date.now() + 1).toString(),
       role: "assistant",
       content: responseContent,
       timestamp: new Date(),
     };
 
     setMessages((prev) => [...prev, assistantMessage]);
     setIsTyping(false);
      if (!isMuted) playAudio(responseContent, assistantMessage.id);
       // Persist the updated conversation
       setMessages((prev) => {
         saveSession(prev, narrative || null, mode);
         return prev;
       });
   };

   const playAudio = async (text: string, id: string) => {
     try {
       if (audioRef.current) {
         audioRef.current.pause();
         audioRef.current = null;
       }
       setPlayingId(id);
       const activeVoice = voiceRef.current;
       const cacheKey = `${activeVoice}::${text}`;
       let src = audioCacheRef.current.get(cacheKey);
       if (!src) {
         const { data, error } = await supabase.functions.invoke("text-to-speech", {
           body: { text, voice: activeVoice },
         });
         if (error || !(data as any)?.audioContent) {
           // Voice service unavailable -> browser TTS fallback
           speakWithBrowser(text, id);
           return;
         }
         const mime = (data as any).mimeType || "audio/wav";
         src = `data:${mime};base64,${(data as any).audioContent}`;
         audioCacheRef.current.set(cacheKey, src);
       }
       const audio = new Audio(src);
       audioRef.current = audio;
       audio.onended = () => setPlayingId(null);
       audio.onerror = () => setPlayingId(null);
       try {
         await audio.play();
       } catch (playErr) {
         console.warn("Autoplay bloqueado, esperando interacción del usuario:", playErr);
         setPlayingId(null);
         toast({
           title: "Toca para activar el audio",
           description: "El navegador bloqueó la reproducción automática. Pulsa el botón ▶️ del mensaje para escucharlo.",
         });
       }
     } catch (e) {
       console.error("playAudio error:", e);
        speakWithBrowser(text, id);
     }
   };

    const femaleHints = [
      "female", "mujer", "femenina",
      "mónica", "monica", "paulina", "lucia", "luciana", "helena",
      "google español", "google us english", "samantha", "victoria",
      "sara", "sabina", "elvira", "zira", "tessa", "karen", "fiona",
    ];
    const maleHints = ["male", "hombre", "diego", "jorge", "carlos", "pablo", "enrique", "george", "daniel", "fred"];

    // Device fallback keeps the gender of the voice chosen for this story
    const pickDeviceVoice = (langCode: string): SpeechSynthesisVoice | null => {
      const voices = window.speechSynthesis.getVoices();
      if (!voices.length) return null;
      const base = langCode.split("-")[0];
      const inLang = voices.filter((v) => v.lang?.toLowerCase().startsWith(base));
      const pool = inLang.length ? inLang : voices;
      const wantMale = voiceGender(voiceRef.current) === "male";
      const wanted = wantMale ? maleHints : femaleHints;
      const other = wantMale ? femaleHints : maleHints;
      const byHint = pool.find((v) => wanted.some((h) => v.name.toLowerCase().includes(h)));
      const notOther = pool.find((v) => !other.some((h) => v.name.toLowerCase().includes(h)));
      return byHint || notOther || pool[0] || null;
    };

    const speakWithBrowser = (text: string, id: string) => {
      try {
        if (typeof window === "undefined" || !("speechSynthesis" in window)) {
          setPlayingId(null);
          return;
        }
        // Strip markdown markers for cleaner narration
        const clean = text.replace(/[*_#`"]/g, "").trim();
        const langCode = language === "es" ? "es-ES" : "en-US";

        const speak = () => {
          window.speechSynthesis.cancel();
          const utter = new SpeechSynthesisUtterance(clean);
          utter.lang = langCode;
          const deviceVoice = pickDeviceVoice(langCode);
          if (deviceVoice) utter.voice = deviceVoice;
          // Warm, calm narration; pitch follows the chosen voice gender
          utter.rate = 0.95;
          utter.pitch = voiceGender(voiceRef.current) === "male" ? 0.9 : 1.15;
          utter.onend = () => setPlayingId(null);
          utter.onerror = () => setPlayingId(null);
          setPlayingId(id);
          window.speechSynthesis.speak(utter);
        };

        // Voices may load asynchronously the first time
        if (window.speechSynthesis.getVoices().length === 0) {
          window.speechSynthesis.onvoiceschanged = () => {
            window.speechSynthesis.onvoiceschanged = null;
            speak();
          };
          // Trigger load
          window.speechSynthesis.getVoices();
        } else {
          speak();
        }
      } catch (e) {
        console.error("speakWithBrowser error:", e);
        setPlayingId(null);
      }
    };

   const stopAudio = () => {
     if (audioRef.current) {
       audioRef.current.pause();
       audioRef.current = null;
     }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
     setPlayingId(null);
   };

   // Reset the roleplay: wipe the saved conversation so it starts fresh and stays private
   const resetRoleplay = async () => {
     if (!user || !storyId) return;
     stopAudio();
     await supabase
       .from("story_sessions")
       .delete()
       .eq("user_id", user.id)
       .eq("story_id", storyId);
     setMessages(story ? [{ id: "intro", role: "assistant", content: getIntroMessage(story), timestamp: new Date() }] : []);
     setSceneImages({});
     toast({ title: language === "es" ? "Roleplay reiniciado. La conversación anterior se borró." : "Roleplay reset. Previous conversation deleted." });
   };

   const buildIllustrationContext = (text: string, key: string) => {
     const targetIndex = messages.findIndex((m) => m.id === key);
     const recentMessages = targetIndex >= 0
       ? messages.slice(Math.max(0, targetIndex - 5), targetIndex + 1)
       : [];
     const recentContext = recentMessages
       .filter((m) => m.id !== "intro")
       .map((m) => `${m.role === "user" ? "Player" : "Character"}: ${m.content}`)
       .join("\n\n");

     return [
       `Story: ${story?.title || ""}`,
       `Premise: ${story?.description || ""}`,
       `Character role: ${story?.character_role || ""}`,
       `Player role: ${story?.player_role || ""}`,
       recentContext ? `Recent roleplay context:\n${recentContext}` : "",
       `Latest moment to illustrate:\n${text}`,
     ].filter(Boolean).join("\n\n");
   };

   // Generate a vivid illustration of a scene; the cover is only a loose identity reference
   const illustrateScene = async (text: string, key: string) => {
     if (!story || illustratingId) return;
     setIllustratingId(key);
     try {
       const { data, error } = await supabase.functions.invoke("illustrate-scene", {
         body: {
            sceneText: buildIllustrationContext(text, key),
            focusText: text,
           coverImageUrl: story.cover_image && !isVideoCover ? story.cover_image : undefined,
           characterRole: story.character_role,
            playerRole: story.player_role,
            storyTitle: story.title,
            storyDescription: story.description,
           explicit: story.story_type === "real_sex" || !!story.has_explicit_images,
           language,
         },
       });
        if (error || !(data as any)?.taskId) {
         toast({
           title: language === "es" ? "No se pudo ilustrar la escena" : "Could not illustrate the scene",
            description: (data as any)?.detail || error?.message,
           variant: "destructive",
         });
         return;
       }
        const taskId = (data as any).taskId as string;
        let completedImageUrl: string | undefined;
        for (let attempt = 0; attempt < 40; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 3000));
          const { data: statusData, error: statusError } = await supabase.functions.invoke("illustrate-scene", {
            body: {
              action: "status",
              taskId,
              prompt: (data as any).prompt,
              blueprint: (data as any).blueprint,
              focusText: text,
            },
          });
          if (statusError || (statusData as any)?.error) {
            toast({
              title: language === "es" ? "No se pudo ilustrar la escena" : "Could not illustrate the scene",
              description: (statusData as any)?.detail || statusError?.message,
              variant: "destructive",
            });
            return;
          }
          if ((statusData as any)?.status === "complete" && (statusData as any)?.imageUrl) {
            completedImageUrl = (statusData as any).imageUrl;
            break;
          }
        }
        if (!completedImageUrl) {
          toast({
            title: language === "es" ? "La ilustración está tardando demasiado" : "The illustration is taking too long",
            description: language === "es" ? "Inténtalo nuevamente en unos minutos." : "Please try again in a few minutes.",
            variant: "destructive",
          });
          return;
        }
        setSceneImages((prev) => ({ ...prev, [key]: completedImageUrl }));
     } finally {
       setIllustratingId(null);
     }
   };

   const generateNarrative = async () => {
     if (!story) return;
     setNarrativeLoading(true);
     setNarrative("");
     try {
       const { data, error } = await supabase.functions.invoke("generate-narrative", {
         body: {
           story: {
             title: story.title,
             description: story.description,
             character_role: story.character_role,
             player_role: story.player_role,
             story_type: story.story_type,
           },
           language,
           explicit: story.story_type === "real_sex" || !!story.has_explicit_images,
           chapters: 5,
         },
       });
       if (error || !(data as any)?.content) {
         const code = (data as any)?.error;
         if (code === "rate_limited") toast({ title: t("mode.rateLimited"), variant: "destructive" });
         else if (code === "credits_exhausted") toast({ title: t("mode.creditsExhausted"), variant: "destructive" });
         else toast({ title: t("mode.aiError"), variant: "destructive" });
       } else {
         setNarrative((data as any).content);
          saveSession(messages, (data as any).content, mode);
       }
     } finally {
       setNarrativeLoading(false);
     }
   };

   useEffect(() => {
     if (mode === "read" && !narrative && !narrativeLoading) {
       generateNarrative();
     }
     // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [mode, language]);

   useEffect(() => {
     return () => {
       if (audioRef.current) audioRef.current.pause();
     };
   }, []);
 
   const handleKeyPress = (e: React.KeyboardEvent) => {
     if (e.key === "Enter" && !e.shiftKey) {
       e.preventDefault();
       handleSendMessage();
     }
   };
 
   if (isLoading) {
     return (
       <MainLayout>
         <div className="container mx-auto px-4 py-8">
           <Skeleton className="h-8 w-48 mb-4" />
           <Skeleton className="h-64 w-full mb-4" />
           <Skeleton className="h-96 w-full" />
         </div>
       </MainLayout>
     );
   }
 
   if (!story) {
     return (
       <MainLayout>
         <div className="container mx-auto px-4 py-8 text-center">
          <p className="text-muted-foreground">{t("story.notFound")}</p>
           <Button onClick={() => navigate("/")} className="mt-4">
             {t("story.back")}
           </Button>
         </div>
       </MainLayout>
     );
   }

  // Auth gate
  if (!authLoading && !user) {
    return (
      <MainLayout>
        <div className="container mx-auto px-4 py-16 max-w-md text-center">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-2xl font-display mb-2">{t("authGate.title")}</h2>
          <p className="text-muted-foreground mb-6">{t("authGate.desc")}</p>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => navigate("/login")}>{t("authGate.signIn")}</Button>
            <Button variant="outline" onClick={() => navigate("/register")}>
              {t("authGate.signUp")}
            </Button>
          </div>
        </div>
      </MainLayout>
    );
  }

  // Adult gate
  const isAdultStory = story.story_type === "real_sex" || story.has_explicit_images;
  if (isAdultStory && !adultEnabled) {
    return (
      <MainLayout>
        <div className="container mx-auto px-4 py-16 max-w-md text-center">
          <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-7 h-7 text-destructive" />
          </div>
          <h2 className="text-2xl font-display mb-2">{t("adult.gateTitle")}</h2>
          <p className="text-muted-foreground mb-6">{t("adult.gateDesc")}</p>
          <Button
            variant="destructive"
            onClick={() => (consentGiven ? enable() : setConsentOpen(true))}
          >
            {t("adult.enable")}
          </Button>
          <div className="mt-4">
            <Button variant="ghost" onClick={() => navigate("/")}>
              {t("story.back")}
            </Button>
          </div>
        </div>
        <AdultConsentDialog
          open={consentOpen}
          onConfirm={() => { grantConsent(); enable(); setConsentOpen(false); }}
          onCancel={() => setConsentOpen(false)}
        />
      </MainLayout>
    );
  }
 
  const coverImage = story.cover_image;
  const isVideoCover = !!coverImage && /\.(mp4|webm|mov|m4v|ogv)(\?|$)/i.test(coverImage);
   const mediaCount = story.video_count > 0 ? story.video_count : story.image_count;
   const mediaType = story.video_count > 0 ? t("chat.videos") : t("chat.images");
   const categories = story.story_categories?.map((sc: any) => sc.categories).filter(Boolean) || [];
 
   return (
     <MainLayout>
       <div className="container mx-auto px-4 py-8">
         {/* Back button */}
         <Button
           variant="ghost"
           onClick={() => navigate("/")}
           className="mb-4 gap-2"
         >
           <ArrowLeft className="w-4 h-4" />
           {t("story.back")}
         </Button>
 
         <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
           {/* Story Info Panel */}
           <div className="lg:col-span-1">
             <Card className="overflow-hidden bg-card border-border">
               {/* Cover Image */}
               <div className="aspect-[3/4] relative overflow-hidden">
                {coverImage ? (
                    isVideoCover ? (
                      <video
                        src={coverImage}
                        className="w-full h-full object-cover"
                        muted
                        loop
                        playsInline
                        autoPlay
                      />
                    ) : (
                      <img
                        src={coverImage}
                        alt={story.title}
                        className="w-full h-full object-cover"
                      />
                    )
                  ) : (
                   <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary to-muted">
                     <span className="text-6xl">📖</span>
                   </div>
                 )}
                 <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent" />
                 
                 <div className="absolute bottom-0 left-0 right-0 p-4">
                   <h1 className="font-display text-2xl text-foreground mb-2">
                      {tTitle || story.title}
                   </h1>
                   <p className="text-sm text-muted-foreground mb-3">
                      {tDescription || story.description}
                   </p>
                   
                   <div className="flex flex-col gap-2 text-sm">
                     <div className="flex items-center gap-2">
                       <span className="text-muted-foreground">{t("chat.you")}:</span>
                        <span className="text-foreground">{tPlayer || story.player_role || t("common.male")}</span>
                     </div>
                     {story.character_role && (
                       <div className="flex items-center gap-2">
                         <span className="text-muted-foreground">{t("chat.char")}:</span>
                          <span className="text-foreground">{tCharacter || story.character_role}</span>
                       </div>
                     )}
                   </div>
 
                   {mediaCount > 0 && (
                     <div className="flex items-center gap-2 mt-3 text-primary">
                       {story.video_count > 0 ? (
                         <Play className="w-4 h-4" />
                       ) : (
                         <ImageIcon className="w-4 h-4" />
                       )}
                       <span>{mediaCount} {mediaType}</span>
                     </div>
                   )}
                 </div>
               </div>
 
               {/* Categories */}
               {categories.length > 0 && (
                 <div className="p-4 border-t border-border">
                   <div className="flex flex-wrap gap-2">
                      {categories.map((cat: any, i: number) => (
                       <Badge key={cat.id} variant="secondary" className="text-xs">
                          {tCategoryNames[i] || cat.name}
                       </Badge>
                     ))}
                   </div>
                 </div>
               )}
             </Card>
           </div>
 
           {/* Chat Panel */}
           <div className="lg:col-span-2">
            {mode === "select" && (
              <Card className="bg-card border-border p-8">
                <h2 className="font-display text-2xl text-center mb-6">{t("mode.choose")}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    onClick={() => setMode("read")}
                    className="text-left p-6 rounded-lg border border-border bg-secondary/40 hover:bg-secondary hover:border-primary transition-all"
                  >
                    <BookOpen className="w-8 h-8 text-primary mb-3" />
                    <h3 className="font-display text-lg mb-2">{t("mode.read")}</h3>
                    <p className="text-sm text-muted-foreground">{t("mode.readDesc")}</p>
                  </button>
                  <button
                    onClick={() => setMode("roleplay")}
                    className="text-left p-6 rounded-lg border border-border bg-secondary/40 hover:bg-secondary hover:border-primary transition-all"
                  >
                    <MessageSquare className="w-8 h-8 text-primary mb-3" />
                    <h3 className="font-display text-lg mb-2">{t("mode.roleplay")}</h3>
                    <p className="text-sm text-muted-foreground">{t("mode.roleplayDesc")}</p>
                  </button>
                </div>
              </Card>
            )}

            {mode === "read" && (
              <Card className="bg-card border-border">
                <div className="p-4 border-b border-border flex items-center justify-between flex-wrap gap-2">
                  <h2 className="font-display text-lg">{tTitle || story.title}</h2>
                  <div className="flex gap-2">
                    {narrative && (
                      playingId === "narrative" ? (
                        <Button variant="outline" size="sm" onClick={stopAudio} className="gap-2">
                          <VolumeX className="w-4 h-4" /> {t("mode.stop")}
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => playAudio(narrative, "narrative")} className="gap-2">
                          <Volume2 className="w-4 h-4" /> {t("mode.listen")}
                        </Button>
                      )
                    )}
                    <Button variant="outline" size="sm" onClick={generateNarrative} disabled={narrativeLoading} className="gap-2">
                      <RotateCw className="w-4 h-4" /> {t("mode.regenerate")}
                    </Button>
                    {narrative && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => illustrateScene(narrative, "narrative")}
                        disabled={illustratingId === "narrative"}
                        className="gap-2"
                      >
                        {illustratingId === "narrative" ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Sparkles className="w-4 h-4" />
                        )}
                        {language === "es" ? "Ilustrar escena" : "Illustrate scene"}
                      </Button>
                    )}
                    <Button size="sm" onClick={() => setMode("roleplay")} className="gap-2">
                      <MessageSquare className="w-4 h-4" /> {t("mode.switchToRoleplay")}
                    </Button>
                  </div>
                </div>
                <div className="p-6 max-h-[600px] overflow-y-auto">
                  {narrativeLoading ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-4">
                      <Loader2 className="w-8 h-8 text-primary animate-spin" />
                      <p className="text-muted-foreground">{t("mode.generating")}</p>
                    </div>
                  ) : (
                    <article className="max-w-none whitespace-pre-wrap text-foreground leading-relaxed">
                      {sceneImages["narrative"] && (
                        <img
                          src={sceneImages["narrative"]}
                          alt={language === "es" ? "Ilustración de la escena" : "Scene illustration"}
                          className="w-full rounded-lg mb-6 border border-border"
                          loading="lazy"
                        />
                      )}
                      {narrative.split("\n").map((line, i) => {
                        if (line.startsWith("## ")) return <h3 key={i} className="font-display text-xl mt-6 mb-3 text-primary">{line.replace(/^##\s/, "")}</h3>;
                        if (line.startsWith("# ")) return <h2 key={i} className="font-display text-2xl mt-6 mb-3">{line.replace(/^#\s/, "")}</h2>;
                        if (!line.trim()) return <br key={i} />;
                        const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/);
                        return (
                          <p key={i} className="mb-3">
                            {parts.map((p, j) => {
                              if (p.startsWith("**") && p.endsWith("**")) return <strong key={j}>{p.slice(2, -2)}</strong>;
                              if (p.startsWith("*") && p.endsWith("*")) return <em key={j} className="text-muted-foreground">{p.slice(1, -1)}</em>;
                              return p;
                            })}
                          </p>
                        );
                      })}
                    </article>
                  )}
                </div>
              </Card>
            )}

            {mode === "roleplay" && (
             <Card className="h-[600px] flex flex-col bg-card border-border">
               {/* Chat Header */}
               <div className="p-4 border-b border-border flex items-center justify-between">
                  <h2 className="font-display text-lg">{tTitle || story.title}</h2>
                 <div className="flex items-center gap-1">
                    <CallDialog
                      story={story}
                      language={language}
                      voice={voice}
                      history={messages
                        .filter((message) => message.id !== "intro")
                        .map((message) => ({ role: message.role, content: message.content }))}
                      onTurn={(userText, assistantText) => {
                        setMessages((previous) => {
                          const next: Message[] = [
                            ...previous,
                            { id: `${Date.now()}-u`, role: "user", content: userText, timestamp: new Date() },
                            { id: `${Date.now()}-a`, role: "assistant", content: assistantText, timestamp: new Date() },
                          ];
                          saveSession(next, narrative || null, mode);
                          return next;
                        });
                      }}
                    />
                   <Button
                     variant="ghost"
                     size="sm"
                     onClick={resetRoleplay}
                     className="gap-2"
                     title={language === "es" ? "Reiniciar y borrar la conversación" : "Reset and delete the conversation"}
                   >
                     <RotateCw className="w-4 h-4" />
                     <span className="hidden sm:inline">{language === "es" ? "Reiniciar" : "Reset"}</span>
                   </Button>
                   <Button
                     variant="ghost"
                     size="icon"
                     onClick={() => setIsMuted(!isMuted)}
                   >
                     {isMuted ? (
                       <VolumeX className="w-5 h-5" />
                     ) : (
                       <Volume2 className="w-5 h-5" />
                     )}
                   </Button>
                 </div>
               </div>
 
               {/* Messages */}
               <div className="flex-1 overflow-y-auto p-4 space-y-4">
                 {messages.map((message) => (
                   <div
                     key={message.id}
                     className={`flex ${
                       message.role === "user" ? "justify-end" : "justify-start"
                     }`}
                   >
                     <div
                       className={`max-w-[80%] rounded-lg p-3 ${
                         message.role === "user"
                           ? "bg-primary text-primary-foreground"
                           : "bg-secondary text-foreground"
                       }`}
                     >
                       <p className="whitespace-pre-wrap text-sm">
                         {message.content.split(/(\*[^*]+\*|\*\*[^*]+\*\*)/).map((part, i) => {
                           if (part.startsWith("**") && part.endsWith("**")) {
                             return <strong key={i}>{part.slice(2, -2)}</strong>;
                           }
                           if (part.startsWith("*") && part.endsWith("*")) {
                             return <em key={i} className="text-muted-foreground">{part.slice(1, -1)}</em>;
                           }
                           return part;
                         })}
                       </p>
                       <span className="text-xs opacity-60 mt-1 block">
                         {message.timestamp.toLocaleTimeString([], {
                           hour: "2-digit",
                           minute: "2-digit",
                         })}
                       </span>
                       {message.role === "assistant" && message.id !== "intro" && (
                         <div className="mt-2">
                           {sceneImages[message.id] ? (
                             <img
                               src={sceneImages[message.id]}
                               alt={language === "es" ? "Ilustración de la escena" : "Scene illustration"}
                               className="w-full max-w-xs rounded-lg border border-border"
                               loading="lazy"
                             />
                           ) : (
                             <button
                               onClick={() => illustrateScene(message.content, message.id)}
                               disabled={illustratingId === message.id}
                               className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-60"
                             >
                               {illustratingId === message.id ? (
                                 <Loader2 className="w-3 h-3 animate-spin" />
                               ) : (
                                 <Sparkles className="w-3 h-3" />
                               )}
                               {language === "es" ? "Ilustrar esta escena" : "Illustrate this scene"}
                             </button>
                           )}
                         </div>
                       )}
                     </div>
                   </div>
                 ))}
                 
                 {isTyping && (
                   <div className="flex justify-start">
                     <div className="bg-secondary rounded-lg p-3">
                       <div className="flex space-x-1">
                         <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                         <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                         <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                       </div>
                     </div>
                   </div>
                 )}
                 
                 <div ref={messagesEndRef} />
               </div>
 
               {/* Input Area */}
               <div className="p-4 border-t border-border">
                 <div className="flex gap-2">
                   <Input
                     value={inputMessage}
                     onChange={(e) => setInputMessage(e.target.value)}
                     onKeyPress={handleKeyPress}
                     placeholder={t("story.typeMessage")}
                     className="flex-1 bg-secondary border-border"
                     disabled={isTyping}
                   />
                   <Button
                     onClick={handleSendMessage}
                     disabled={!inputMessage.trim() || isTyping}
                     className="gap-2"
                   >
                     <Send className="w-4 h-4" />
                     <span className="hidden sm:inline">{t("story.send")}</span>
                   </Button>
                 </div>
               </div>
             </Card>
             )}
           </div>
         </div>
       </div>

     </MainLayout>
   );
 };
 
 export default StoryDetail;