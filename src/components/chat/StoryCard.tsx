 import { Card } from "@/components/ui/card";
 import { Play, Image as ImageIcon } from "lucide-react";
 import { getStoryImage } from "@/lib/storyImages";
 import { useLanguage } from "@/contexts/LanguageContext";
 
 interface Story {
   id: string;
   title: string;
   cover_image?: string | null;
   player_role?: string | null;
   character_role?: string | null;
   video_count: number;
   image_count: number;
   has_explicit_images: boolean;
 }
 
 interface StoryCardProps {
   story: Story;
   onClick?: () => void;
 }
 
 export const StoryCard = ({ story, onClick }: StoryCardProps) => {
   const { t } = useLanguage();
   const mediaCount = story.video_count > 0 ? story.video_count : story.image_count;
   const mediaType = story.video_count > 0 ? t("chat.videos") : t("chat.images");
   const coverImage = getStoryImage(story.title) || story.cover_image;
 
   return (
     <Card
       onClick={onClick}
       className="group cursor-pointer overflow-hidden border-border bg-card hover:border-primary/50 transition-all duration-300"
     >
       <div className="aspect-[3/4] relative overflow-hidden bg-muted">
         {coverImage ? (
           <img
             src={coverImage}
             alt={story.title}
             className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
           />
         ) : (
           <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary to-muted">
             <span className="text-4xl text-muted-foreground">📖</span>
           </div>
         )}
         <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent" />
         
         {/* Content overlay */}
         <div className="absolute bottom-0 left-0 right-0 p-4">
           <h3 className="font-medium text-foreground text-lg mb-2 line-clamp-2">
             {story.title}
           </h3>
           
           <div className="flex flex-col gap-1 text-sm text-muted-foreground">
             {story.character_role && (
               <span>{t("chat.char")}: {story.character_role}</span>
             )}
             <span>{t("chat.you")}: {story.player_role || "man"}</span>
           </div>
 
           {mediaCount > 0 && (
             <div className="flex items-center gap-1 mt-2 text-primary text-sm">
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
     </Card>
   );
 };