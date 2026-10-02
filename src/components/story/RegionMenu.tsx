import { ChevronDown, Globe as Globe2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { STORY_REGIONS, normalizeRegion, regionById } from "@/lib/regions";

interface RegionMenuProps {
  value: string;
  accent: boolean;
  language: string;
  onChange: (value: string) => void;
  onAccentChange: (enabled: boolean) => void;
}

/** Accent can be turned off. The Gemini voice then speaks without a country tone. */
export const RegionMenu = ({ value, accent, language, onChange, onAccentChange }: RegionMenuProps) => {
  const current = regionById(normalizeRegion(value));
  const es = language === "es";
  const label = accent ? current.label : (es ? "Normal" : "Normal");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 shrink-0 gap-1 px-2"
          aria-label={accent ? `${es ? "Acento" : "Accent"}: ${current.label}` : (es ? "Voz normal, sin acento regional" : "Normal voice, no regional accent")}
          title={label}
        >
          <Globe2 className="h-4 w-4" />
          <span className="max-w-[5.5rem] truncate text-xs">{label}</span>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <div className="flex items-center justify-between gap-3 px-2 py-2">
          <span className="text-sm">{es ? "Acento regional" : "Regional accent"}</span>
          <Switch
            checked={accent}
            onCheckedChange={onAccentChange}
            aria-label={es ? "Activar o desactivar el acento regional" : "Turn the regional accent on or off"}
          />
        </div>
        {STORY_REGIONS.map((region) => (
          <DropdownMenuItem key={region.id} onClick={() => { onChange(region.id); onAccentChange(true); }}>
            {region.label}
            {accent && region.id === current.id ? <span className="ml-auto pl-3">✓</span> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
