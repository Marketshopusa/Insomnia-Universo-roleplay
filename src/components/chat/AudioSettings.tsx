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
   { value: "scarlett-hd", label: "Scarlett HD", description: "A soft, gentle female voice with elegance", tags: ["gentle", "elegant"] },
   { value: "max-deep", label: "Max Deep", description: "A deep, confident male voice", tags: ["deep", "confident"] },
   { value: "luna-sweet", label: "Luna Sweet", description: "A sweet, playful female voice", tags: ["sweet", "playful"] },
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
   const selectedVoice = voices.find(v => v.value === voiceName) || voices[0];
 
   return (
     <div className="space-y-6 p-6 bg-card rounded-lg border border-border">
       <div className="flex items-center gap-2 text-lg font-medium">
         <Volume2 className="w-5 h-5 text-primary" />
         <span>Audio</span>
       </div>
 
       <div className="grid grid-cols-2 gap-4">
         <div className="space-y-2">
           <Label className="text-muted-foreground text-sm">Gender:</Label>
           <Select value={genderFilter} onValueChange={onGenderChange}>
             <SelectTrigger>
               <SelectValue />
             </SelectTrigger>
             <SelectContent>
               <SelectItem value="All">All</SelectItem>
               <SelectItem value="Female">Female</SelectItem>
               <SelectItem value="Male">Male</SelectItem>
             </SelectContent>
           </Select>
         </div>
 
         <div className="space-y-2">
           <Label className="text-muted-foreground text-sm">Style:</Label>
           <Select value={styleFilter} onValueChange={onStyleChange}>
             <SelectTrigger>
               <SelectValue />
             </SelectTrigger>
             <SelectContent>
               <SelectItem value="All">All</SelectItem>
               <SelectItem value="Gentle">Gentle</SelectItem>
               <SelectItem value="Confident">Confident</SelectItem>
               <SelectItem value="Playful">Playful</SelectItem>
             </SelectContent>
           </Select>
         </div>
       </div>
 
       <div className="space-y-2">
         <Label className="text-muted-foreground text-sm">Voice:</Label>
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
         
         <p className="text-sm text-muted-foreground">{selectedVoice.description}</p>
         <div className="flex gap-2">
           {selectedVoice.tags.map((tag) => (
             <span key={tag} className="text-xs px-2 py-1 bg-secondary rounded text-muted-foreground">
               {tag}
             </span>
           ))}
         </div>
         <p className="text-xs text-muted-foreground">16.0 ♦ per 10k chars</p>
       </div>
 
       <div className="flex items-center justify-between">
         <div className="flex items-center gap-2">
           <Switch checked={isMuted} onCheckedChange={onMutedChange} />
           <Label className="text-sm">Mute</Label>
         </div>
         <div className="flex items-center gap-2">
           <Switch checked={autoplay} onCheckedChange={onAutoplayChange} />
           <Label className="text-sm">Autoplay</Label>
         </div>
       </div>
     </div>
   );
 };