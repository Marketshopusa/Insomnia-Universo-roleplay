import { Headphones, Volume2, VolumeX } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { AudioSettings } from "./AudioSettings";
import { cn } from "@/lib/utils";

interface AudioQuickControlProps {
  voiceName: string;
  genderFilter: string;
  styleFilter: string;
  isMuted: boolean;
  autoplay: boolean;
  onVoiceChange: (v: string) => void;
  onGenderChange: (v: string) => void;
  onStyleChange: (v: string) => void;
  onMutedChange: (v: boolean) => void;
  onAutoplayChange: (v: boolean) => void;
}

export const AudioQuickControl = (props: AudioQuickControlProps) => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-2 px-3 py-2 text-xs font-medium",
            "border border-border/60 bg-card/60 backdrop-blur-md",
            "hover:border-accent/50 transition-colors"
          )}
        >
          <Headphones className="w-4 h-4 text-accent" />
          <span className="hidden sm:inline uppercase tracking-[0.2em]">Audio</span>
          {props.isMuted ? (
            <VolumeX className="w-3.5 h-3.5 text-destructive" />
          ) : (
            <Volume2 className="w-3.5 h-3.5 text-primary" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-0 border-border/60">
        <AudioSettings {...props} />
      </PopoverContent>
    </Popover>
  );
};