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
 
 interface Message {
   id: string;
   role: "user" | "assistant";
   content: string;
   timestamp: Date;
 }
 
 const StoryDetail = () => {
   const { storyId } = useParams<{ storyId: string }>();
   const navigate = useNavigate();
   const { t } = useLanguage();
   const { data: story, isLoading } = useStory(storyId || "");
   
   const [messages, setMessages] = useState<Message[]>([]);
   const [inputMessage, setInputMessage] = useState("");
   const [isTyping, setIsTyping] = useState(false);
   const [isMuted, setIsMuted] = useState(false);
   const messagesEndRef = useRef<HTMLDivElement>(null);
 
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
   }, [story]);
 
   const getIntroMessage = (story: any) => {
     const characterRole = story.character_role || "character";
     const playerRole = story.player_role || "player";
     
     return `*${story.title}*\n\n${story.description || "Welcome to this story..."}\n\nYou are playing as: **${playerRole}**\nI am playing as: **${characterRole}**\n\n*The scene is set. What would you like to do?*`;
   };
 
   const generateResponse = async (userMessage: string) => {
     // Simulated AI responses based on story context
     const responses = [
       "*looks at you with interest* That's an interesting approach. Tell me more about what you're thinking...",
       "*moves closer* I wasn't expecting that. You've certainly caught my attention now.",
       "*smiles softly* I like the way you think. This could be the beginning of something special.",
       "*pauses for a moment* You surprise me. Most people wouldn't say something like that.",
       "*laughs gently* Well, this is getting interesting. What else do you have in mind?",
       "*tilts head thoughtfully* I've been waiting for someone like you to come along.",
       "*eyes sparkle with curiosity* Continue... I want to hear more.",
       "*steps forward* The night is young and full of possibilities...",
     ];
     
     return responses[Math.floor(Math.random() * responses.length)];
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
           <p className="text-muted-foreground">Story not found.</p>
           <Button onClick={() => navigate("/")} className="mt-4">
             {t("story.back")}
           </Button>
         </div>
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
                     {story.title}
                   </h1>
                   <p className="text-sm text-muted-foreground mb-3">
                     {story.description}
                   </p>
                   
                   <div className="flex flex-col gap-2 text-sm">
                     <div className="flex items-center gap-2">
                       <span className="text-muted-foreground">{t("chat.you")}:</span>
                       <span className="text-foreground">{story.player_role || "man"}</span>
                     </div>
                     {story.character_role && (
                       <div className="flex items-center gap-2">
                         <span className="text-muted-foreground">{t("chat.char")}:</span>
                         <span className="text-foreground">{story.character_role}</span>
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
                     {categories.map((cat: any) => (
                       <Badge key={cat.id} variant="secondary" className="text-xs">
                         {cat.name}
                       </Badge>
                     ))}
                   </div>
                 </div>
               )}
             </Card>
           </div>
 
           {/* Chat Panel */}
           <div className="lg:col-span-2">
             <Card className="h-[600px] flex flex-col bg-card border-border">
               {/* Chat Header */}
               <div className="p-4 border-b border-border flex items-center justify-between">
                 <h2 className="font-display text-lg">{story.title}</h2>
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
           </div>
         </div>
       </div>
     </MainLayout>
   );
 };
 
 export default StoryDetail;