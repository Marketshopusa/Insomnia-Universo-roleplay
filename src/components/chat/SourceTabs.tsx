 import { cn } from "@/lib/utils";
 import { useLanguage } from "@/contexts/LanguageContext";
 
 type StorySource = "crafted" | "custom";
 
 interface SourceTabsProps {
   activeSource: StorySource;
   onSourceChange: (source: StorySource) => void;
 }
 
 export const SourceTabs = ({ activeSource, onSourceChange }: SourceTabsProps) => {
   const { t } = useLanguage();
   
   const tabs: { value: StorySource; labelKey: string }[] = [
     { value: "crafted", labelKey: "source.crafted" },
     { value: "custom", labelKey: "source.custom" },
   ];
 
   return (
     <div className="flex rounded-lg overflow-hidden border border-border bg-secondary">
       {tabs.map((tab) => (
         <button
           key={tab.value}
           onClick={() => onSourceChange(tab.value)}
           className={cn(
             "flex-1 px-6 py-3 text-sm font-medium transition-all",
             activeSource === tab.value
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