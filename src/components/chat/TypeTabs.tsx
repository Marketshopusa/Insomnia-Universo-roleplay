 import { cn } from "@/lib/utils";
 import { useLanguage } from "@/contexts/LanguageContext";
 
 type StoryType = "adventure" | "roleplay" | "real_sex";
 
 interface TypeTabsProps {
   activeType: StoryType;
   onTypeChange: (type: StoryType) => void;
 }
 
 export const TypeTabs = ({ activeType, onTypeChange }: TypeTabsProps) => {
   const { t } = useLanguage();
   
   const tabs: { value: StoryType; labelKey: string }[] = [
     { value: "adventure", labelKey: "type.adventure" },
     { value: "roleplay", labelKey: "type.roleplay" },
     { value: "real_sex", labelKey: "type.realSex" },
   ];
 
   return (
     <div className="flex rounded-lg overflow-hidden border border-border bg-secondary">
       {tabs.map((tab) => (
         <button
           key={tab.value}
           onClick={() => onTypeChange(tab.value)}
           className={cn(
             "flex-1 px-6 py-3 text-sm font-medium transition-all",
             activeType === tab.value
               ? "bg-muted text-foreground"
               : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
           )}
         >
           {t(tab.labelKey)}
         </button>
       ))}
     </div>
   );
 };