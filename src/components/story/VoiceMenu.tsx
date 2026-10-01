import { ChevronDown, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STORY_VOICES, normalizeStoryVoice } from "@/lib/voices";

interface VoiceMenuProps {
  value: string;
  language: string;
  onChange: (value: string) => void;
}

/** Button 1: feminine Chirp voice. Sits beside the accent button and the red phone. */
export const VoiceMenu = ({ value, language, onChange }: VoiceMenuProps) => {
  const current = STORY_VOICES.find((voice) => voice.value === normalizeStoryVoice(value)) ?? STORY_VOICES[0];
  const es = language === "es";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 shrink-0 gap-1 px-2"
          aria-label={`${es ? "Voz" : "Voice"}: ${current.label}`}
          title={current.label}
        >
          <Volume2 className="h-4 w-4" />
          <span className="max-w-[5.5rem] truncate text-xs">{current.label}</span>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
        {STORY_VOICES.map((voice) => (
          <DropdownMenuItem key={voice.value} onClick={() => onChange(voice.value)}>
            {voice.label}
            <span className="ml-2 text-xs text-muted-foreground">
              {es ? voice.descriptionEs : voice.descriptionEn}
            </span>
            {voice.value === current.value ? <span className="ml-auto pl-2">✓</span> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
