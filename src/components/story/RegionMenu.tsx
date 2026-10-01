import { ChevronDown, Globe as Globe2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STORY_REGIONS, normalizeRegion, regionById } from "@/lib/regions";

interface RegionMenuProps {
  value: string;
  language: string;
  onChange: (value: string) => void;
}

/** Button 2: accent and slang. Sits immediately beside the voice button. */
export const RegionMenu = ({ value, language, onChange }: RegionMenuProps) => {
  const current = regionById(normalizeRegion(value));
  const es = language === "es";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 shrink-0 gap-1 px-2"
          aria-label={`${es ? "Acento" : "Accent"}: ${current.label}`}
          title={current.label}
        >
          <Globe2 className="h-4 w-4" />
          <span className="max-w-[5.5rem] truncate text-xs">{current.label}</span>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {STORY_REGIONS.map((region) => (
          <DropdownMenuItem key={region.id} onClick={() => onChange(region.id)}>
            {region.label}
            {region.id === current.id ? <span className="ml-auto pl-3">✓</span> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
