 import { useState, useRef, useEffect } from "react";
 import { useParams, useNavigate } from "react-router-dom";
 import { MainLayout } from "@/components/layout/MainLayout";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { Card } from "@/components/ui/card";
 import { Badge } from "@/components/ui/badge";
 import { Skeleton } from "@/components/ui/skeleton";
 import { ArrowLeft, Send, Play, Image as ImageIcon, Volume2, VolumeX } from "lucide-react";
 import { useStory } from "@/hooks/useStories";
 import { useLanguage } from "@/contexts/LanguageContext";
import { useTranslatedTexts, useTranslatedText } from "@/hooks/useTranslatedTexts";
import { useAuth } from "@/contexts/AuthContext";
import { useAdultMode } from "@/contexts/AdultModeContext";
import { AdultConsentDialog } from "@/components/adult/AdultConsentDialog";
import { Lock, ShieldAlert } from "lucide-react";
 
 interface Message {
   id: string;
   role: "user" | "assistant";
   content: string;
   timestamp: Date;
 }
 
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
 
   const scrollToBottom = () => {
     messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
   };
 
   useEffect(() => {
     scrollToBottom();
   }, [messages]);
 
   // Initialize with story intro message
   useEffect(() => {
     if (story && messages.length === 0) {
       const introMessage: Message = {
         id: "intro",
         role: "assistant",
         content: getIntroMessage(story),
         timestamp: new Date(),
       };
       setMessages([introMessage]);
     }
  }, [story, language, tTitle, tDescription, tCharacter, tPlayer]);

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
    // Localized simulated responses
    const responsesEn = [
       "*looks at you with interest* That's an interesting approach. Tell me more about what you're thinking...",
       "*moves closer* I wasn't expecting that. You've certainly caught my attention now.",
       "*smiles softly* I like the way you think. This could be the beginning of something special.",
       "*pauses for a moment* You surprise me. Most people wouldn't say something like that.",
       "*laughs gently* Well, this is getting interesting. What else do you have in mind?",
       "*tilts head thoughtfully* I've been waiting for someone like you to come along.",
       "*eyes sparkle with curiosity* Continue... I want to hear more.",
       "*steps forward* The night is young and full of possibilities...",
     ];
    const responsesEs = [
      "*te mira con interés* Es un enfoque interesante. Cuéntame más sobre lo que estás pensando...",
      "*se acerca* No me lo esperaba. Definitivamente has captado mi atención.",
      "*sonríe suavemente* Me gusta cómo piensas. Esto podría ser el comienzo de algo especial.",
      "*hace una pausa* Me sorprendes. La mayoría de la gente no diría algo así.",
      "*ríe con suavidad* Bueno, esto se está poniendo interesante. ¿Qué más tienes en mente?",
      "*inclina la cabeza pensativa* He estado esperando a alguien como tú.",
      "*sus ojos brillan de curiosidad* Continúa... quiero oír más.",
      "*da un paso al frente* La noche es joven y está llena de posibilidades...",
    ];
    const pool = language === "es" ? responsesEs : responsesEn;
    return pool[Math.floor(Math.random() * pool.length)];
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
 
     // Simulate AI response delay
     await new Promise((resolve) => setTimeout(resolve, 1500 + Math.random() * 1000));
 
     const responseContent = await generateResponse(inputMessage);
     
     const assistantMessage: Message = {
       id: (Date.now() + 1).toString(),
       role: "assistant",
       content: responseContent,
       timestamp: new Date(),
     };
 
     setMessages((prev) => [...prev, assistantMessage]);
     setIsTyping(false);
   };
 
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
                   <img
                     src={coverImage}
                     alt={story.title}
                     className="w-full h-full object-cover"
                   />
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