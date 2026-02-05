 import { Switch } from "@/components/ui/switch";
 import { Label } from "@/components/ui/label";
 import { useLanguage } from "@/contexts/LanguageContext";
 
 interface ExplicitToggleProps {
   checked: boolean;
   onCheckedChange: (checked: boolean) => void;
 }
 
 export const ExplicitToggle = ({ checked, onCheckedChange }: ExplicitToggleProps) => {
   const { t } = useLanguage();
   
   return (
     <div className="flex items-center gap-3">
       <Switch
         id="explicit-toggle"
         checked={checked}
         onCheckedChange={onCheckedChange}
       />
       <Label htmlFor="explicit-toggle" className="text-sm text-muted-foreground cursor-pointer">
         {t("explicit.toggle")}
       </Label>
     </div>
   );
 };