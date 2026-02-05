 import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
 } from "@/components/ui/select";
 import { Switch } from "@/components/ui/switch";
 import { Label } from "@/components/ui/label";
 import { Volume2 } from "lucide-react";
  import { useLanguage } from "@/contexts/LanguageContext";
 
 interface AudioSettingsProps {
   voiceName: string;
   genderFilter: string;
   styleFilter: string;
   isMuted: boolean;
   autoplay: boolean;
   onVoiceChange: (voice: string) => void;
   onGenderChange: (gender: string) => void;
   onStyleChange: (style: string) => void;
   onMutedChange: (muted: boolean) => void;
   onAutoplayChange: (autoplay: boolean) => void;
 }
 
  const voices = [
    {
      value: "scarlett-hd",
      label: "Scarlett HD",
      descriptionKey: "voice.scarlettHd.desc",
      tagKeys: ["tag.gentle", "tag.elegant"],
    },
    {
      value: "max-deep",
      label: "Max Deep",
      descriptionKey: "voice.maxDeep.desc",
      tagKeys: ["tag.deep", "tag.confident"],
    },
    {
      value: "luna-sweet",
      label: "Luna Sweet",
      descriptionKey: "voice.lunaSweet.desc",
      tagKeys: ["tag.sweet", "tag.playful"],
    },
  ];
 
 export const AudioSettings = ({
   voiceName,
   genderFilter,
   styleFilter,
   isMuted,
   autoplay,
   onVoiceChange,
   onGenderChange,
   onStyleChange,
   onMutedChange,
   onAutoplayChange,
 }: AudioSettingsProps) => {
    const { t } = useLanguage();
   const selectedVoice = voices.find(v => v.value === voiceName) || voices[0];
 
   return (
     <div className="space-y-6 p-6 bg-card rounded-lg border border-border">
       <div className="flex items-center gap-2 text-lg font-medium">
         <Volume2 className="w-5 h-5 text-primary" />
          <span>{t("audio.title")}</span>
       </div>
 
       <div className="grid grid-cols-2 gap-4">
         <div className="space-y-2">
            <Label className="text-muted-foreground text-sm">{t("audio.gender")}:</Label>
           <Select value={genderFilter} onValueChange={onGenderChange}>
             <SelectTrigger>
               <SelectValue />
             </SelectTrigger>
             <SelectContent>
                <SelectItem value="All">{t("common.all")}</SelectItem>
                <SelectItem value="Female">{t("common.female")}</SelectItem>
                <SelectItem value="Male">{t("common.male")}</SelectItem>
             </SelectContent>
           </Select>
         </div>
 
         <div className="space-y-2">
            <Label className="text-muted-foreground text-sm">{t("audio.style")}:</Label>
           <Select value={styleFilter} onValueChange={onStyleChange}>
             <SelectTrigger>
               <SelectValue />
             </SelectTrigger>
             <SelectContent>
                <SelectItem value="All">{t("common.all")}</SelectItem>
                <SelectItem value="Gentle">{t("style.gentle")}</SelectItem>
                <SelectItem value="Confident">{t("style.confident")}</SelectItem>
                <SelectItem value="Playful">{t("style.playful")}</SelectItem>
             </SelectContent>
           </Select>
         </div>
       </div>
 
       <div className="space-y-2">
          <Label className="text-muted-foreground text-sm">{t("audio.voice")}:</Label>
         <Select value={voiceName} onValueChange={onVoiceChange}>
           <SelectTrigger>
             <SelectValue />
           </SelectTrigger>
           <SelectContent>
             {voices.map((voice) => (
               <SelectItem key={voice.value} value={voice.value}>
                 {voice.label}
               </SelectItem>
             ))}
           </SelectContent>
         </Select>
         
          <p className="text-sm text-muted-foreground">{t(selectedVoice.descriptionKey)}</p>
         <div className="flex gap-2">
            {selectedVoice.tagKeys.map((tagKey) => (
              <span key={tagKey} className="text-xs px-2 py-1 bg-secondary rounded text-muted-foreground">
                {t(tagKey)}
             </span>
           ))}
         </div>
          <p className="text-xs text-muted-foreground">16.0 ♦ {t("audio.per10k")}</p>
       </div>
 
       <div className="flex items-center justify-between">
         <div className="flex items-center gap-2">
           <Switch checked={isMuted} onCheckedChange={onMutedChange} />
            <Label className="text-sm">{t("audio.muted")}</Label>
         </div>
         <div className="flex items-center gap-2">
           <Switch checked={autoplay} onCheckedChange={onAutoplayChange} />
            <Label className="text-sm">{t("audio.autoplay")}</Label>
         </div>
       </div>
     </div>
   );
 };