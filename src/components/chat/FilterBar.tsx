import { ChevronDown, Compass, Drama, Flame, Sparkles, Users, Filter } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

type StoryType = "adventure" | "roleplay" | "real_sex";
type StorySource = "crafted" | "custom";

interface FilterBarProps {
  storyType: StoryType;
  storySource: StorySource;
  hasExplicit: boolean;
  onTypeChange: (t: StoryType) => void;
  onSourceChange: (s: StorySource) => void;
  onExplicitChange: (v: boolean) => void;
}

const TYPE_ICON: Record<StoryType, React.ComponentType<{ className?: string }>> = {
  adventure: Compass,
  roleplay: Drama,
  real_sex: Flame,
};

const SOURCE_ICON: Record<StorySource, React.ComponentType<{ className?: string }>> = {
  crafted: Users,
  custom: Sparkles,
};

export const FilterBar = ({
  storyType,
  storySource,
  hasExplicit,
  onTypeChange,
  onSourceChange,
  onExplicitChange,
}: FilterBarProps) => {
  const { t } = useLanguage();

  const types: StoryType[] = ["adventure", "roleplay", "real_sex"];
  const sources: StorySource[] = ["crafted", "custom"];

  const TypeIcon = TYPE_ICON[storyType];
  const SourceIcon = SOURCE_ICON[storySource];

  const typeLabelKey = `type.${storyType === "real_sex" ? "realSex" : storyType}`;
  const sourceLabelKey = `source.${storySource}`;

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 md:gap-3 p-2 rounded-full",
          "border border-border/60 bg-card/60 backdrop-blur-md",
          "shadow-[0_8px_30px_-12px_hsl(var(--primary)/0.35)]"
        )}
      >
        <div className="hidden md:flex items-center gap-2 pl-3 pr-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
          <Filter className="w-3.5 h-3.5" />
          <span>Filtros</span>
        </div>

        <div className="h-6 w-px bg-border/60 hidden md:block" />

        {/* Type dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all",
                "bg-gradient-to-r from-primary/15 to-accent/10 hover:from-primary/25 hover:to-accent/20",
                "border border-primary/30 text-foreground"
              )}
            >
              <TypeIcon className="w-4 h-4 text-primary" />
              <span>{t(typeLabelKey)}</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>{t("nav.chat")} · Tipo</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {types.map((tp) => {
              const Icon = TYPE_ICON[tp];
              const key = `type.${tp === "real_sex" ? "realSex" : tp}`;
              return (
                <DropdownMenuItem
                  key={tp}
                  onClick={() => onTypeChange(tp)}
                  className={cn(
                    "gap-2 cursor-pointer",
                    storyType === tp && "bg-primary/10 text-primary"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {t(key)}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Source dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all",
                "bg-secondary/60 hover:bg-secondary border border-border text-foreground"
              )}
            >
              <SourceIcon className="w-4 h-4 text-accent" />
              <span>{t(sourceLabelKey)}</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Fuente</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {sources.map((src) => {
              const Icon = SOURCE_ICON[src];
              return (
                <DropdownMenuItem
                  key={src}
                  onClick={() => onSourceChange(src)}
                  className={cn(
                    "gap-2 cursor-pointer",
                    storySource === src && "bg-accent/10 text-accent-foreground"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {t(`source.${src}`)}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/40 border border-border/60">
          <Flame className={cn("w-4 h-4", hasExplicit ? "text-primary" : "text-muted-foreground")} />
          <span className="text-xs md:text-sm text-muted-foreground hidden sm:inline">
            {t("explicit.toggle")}
          </span>
          <Switch checked={hasExplicit} onCheckedChange={onExplicitChange} />
        </div>
      </div>
    </div>
  );
};