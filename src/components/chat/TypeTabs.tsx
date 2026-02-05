 import { cn } from "@/lib/utils";
 
 type StoryType = "adventure" | "roleplay" | "real_sex";
 
 interface TypeTabsProps {
   activeType: StoryType;
   onTypeChange: (type: StoryType) => void;
 }
 
 const tabs: { value: StoryType; label: string }[] = [
   { value: "adventure", label: "Adventure" },
   { value: "roleplay", label: "Roleplay" },
   { value: "real_sex", label: "Real Sex" },
 ];
 
 export const TypeTabs = ({ activeType, onTypeChange }: TypeTabsProps) => {
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
           {tab.label}
         </button>
       ))}
     </div>
   );
 };