 import { Switch } from "@/components/ui/switch";
 import { Label } from "@/components/ui/label";
 
 interface ExplicitToggleProps {
   checked: boolean;
   onCheckedChange: (checked: boolean) => void;
 }
 
 export const ExplicitToggle = ({ checked, onCheckedChange }: ExplicitToggleProps) => {
   return (
     <div className="flex items-center gap-3">
       <Switch
         id="explicit-toggle"
         checked={checked}
         onCheckedChange={onCheckedChange}
       />
       <Label htmlFor="explicit-toggle" className="text-sm text-muted-foreground cursor-pointer">
         Has Explicit Images
       </Label>
     </div>
   );
 };