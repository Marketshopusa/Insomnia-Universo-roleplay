import { ChevronDown, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STORY_VOICES, normalizeStoryVoice } from "@/lib/voices";

interface VoiceMenuProps {
  value: string;
  language: string;
  onChange: (value: string) => void;
}

/** Gemini 2.5 Flash TTS voices. Female names come first; male names follow in the same menu. */
export const VoiceMenu = ({ value, language, onChange }: VoiceMenuProps) => {
  const current = STORY_VOICES.find((voice) => voice.value === normalizeStoryVoice(value)) ?? STORY_VOICES[0];
  const es = language === "es";
  const groups = [
    { label: es ? "Femeninas" : "Female", voices: STORY_VOICES.filter((voice) => voice.gender === "female") },
    { label: es ? "Masculinas" : "Male", voices: STORY_VOICES.filter((voice) => voice.gender === "male") },
  ];
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
      <DropdownMenuContent align="end" className="max-h-[70vh] w-80 overflow-y-auto">
        {groups.map((group, index) => (
          <div key={group.label}>
            {index > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel className="text-xs text-muted-foreground">{group.label}</DropdownMenuLabel>
            {group.voices.map((voice) => (
              <DropdownMenuItem key={voice.value} onClick={() => onChange(voice.value)}>
                {voice.label}
                {voice.formerName ? <span className="ml-1 text-xs text-primary">{voice.formerName}</span> : null}
                <span className="ml-2 text-xs text-muted-foreground">
                  {es ? voice.descriptionEs : voice.descriptionEn}
                </span>
                {voice.value === current.value ? <span className="ml-auto pl-2">✓</span> : null}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
