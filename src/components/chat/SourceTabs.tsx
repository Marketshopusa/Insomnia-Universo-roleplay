 import { cn } from "@/lib/utils";
 
 type StorySource = "crafted" | "custom";
 
 interface SourceTabsProps {
   activeSource: StorySource;
   onSourceChange: (source: StorySource) => void;
 }
 
 const tabs: { value: StorySource; label: string }[] = [
   { value: "crafted", label: "Crafted" },
   { value: "custom", label: "Custom" },
 ];
 
 export const SourceTabs = ({ activeSource, onSourceChange }: SourceTabsProps) => {
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
           {tab.label}
         </button>
       ))}
     </div>
   );
 };