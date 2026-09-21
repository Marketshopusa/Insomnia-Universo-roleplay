import { ArrowUpRight } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTranslatedTexts } from "@/hooks/useTranslatedTexts";
import { cn } from "@/lib/utils";
 
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
  index?: number;
 }
 
export const StoryCard = ({ story, onClick, index }: StoryCardProps) => {
  const { t } = useLanguage();
  const coverImage = story.cover_image;
  const isVideoCover = !!coverImage && /\.(mp4|webm|mov|m4v|ogv)(\?|$)/i.test(coverImage);

  const [tTitle, tCharacter, tPlayer] = useTranslatedTexts([
    story.title,
    story.character_role,
    story.player_role,
  ]);
 
   return (
    <article
      onClick={onClick}
      className={cn(
        "group relative cursor-pointer overflow-hidden border border-border/60",
        "bg-card/60 backdrop-blur-sm transition-all duration-300",
        "hover:border-primary/60 hover:-translate-y-1",
        "hover:shadow-[0_20px_40px_-15px_hsl(var(--primary)/0.4)]"
      )}
    >
      {/* Cover */}
      <div className="aspect-[4/5] relative overflow-hidden bg-muted">
        {coverImage ? (
          isVideoCover ? (
            <video
              src={coverImage}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
              muted
              loop
              playsInline
              autoPlay
            />
          ) : (
            <img
              src={coverImage}
              alt={story.title}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
            />
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary to-muted">
            <span className="text-4xl text-muted-foreground">📖</span>
          </div>
        )}

        {/* Vertical gradient + side accent line */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-primary via-accent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

        {/* Index badge — sello propio */}
        {typeof index === "number" && (
          <div className="absolute top-0 right-0 px-2.5 py-1 bg-background/80 backdrop-blur border-l border-b border-border/60">
            <span className="font-display text-xs italic text-accent">
              N°{String(index + 1).padStart(2, "0")}
            </span>
          </div>
        )}

      </div>

      {/* Footer info — fuera de la imagen, no overlay */}
      <div className="p-3 space-y-1.5">
        <h3 className="font-display text-base leading-tight line-clamp-2 group-hover:text-primary transition-colors">
          {tTitle || story.title}
        </h3>
        <div className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
          {story.character_role && (
            <span className="truncate">
              <span className="text-accent/80">▸</span> {tCharacter || story.character_role}
            </span>
          )}
          <span className="truncate">
            <span className="text-accent/80">▸</span> {tPlayer || story.player_role || t("common.male")}
          </span>
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-border/40">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Insomnia
          </span>
          <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
        </div>
      </div>
    </article>
   );
 };