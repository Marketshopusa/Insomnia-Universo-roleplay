 import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
 } from "@/components/ui/dropdown-menu";
 import { Button } from "@/components/ui/button";
 import { Globe } from "lucide-react";
 import { useLanguage } from "@/contexts/LanguageContext";
 
 export const LanguageSelector = () => {
   const { language, setLanguage, availableLanguages } = useLanguage();
 
   const currentLang = availableLanguages.find((l) => l.code === language);
 
   return (
     <DropdownMenu>
       <DropdownMenuTrigger asChild>
         <Button variant="ghost" size="sm" className="gap-2">
           <Globe className="w-4 h-4" />
           <span className="hidden sm:inline">{currentLang?.flag}</span>
         </Button>
       </DropdownMenuTrigger>
       <DropdownMenuContent align="end" className="bg-card border-border">
         {availableLanguages.map((lang) => (
           <DropdownMenuItem
             key={lang.code}
             onClick={() => setLanguage(lang.code)}
             className={`cursor-pointer ${
               language === lang.code ? "bg-primary/20" : ""
             }`}
           >
             <span className="mr-2">{lang.flag}</span>
             {lang.name}
           </DropdownMenuItem>
         ))}
       </DropdownMenuContent>
     </DropdownMenu>
   );
 };