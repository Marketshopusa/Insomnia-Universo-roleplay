 import { useState, useEffect } from "react";
 import { useNavigate } from "react-router-dom";
 import { MainLayout } from "@/components/layout/MainLayout";
import { FilterBar } from "@/components/chat/FilterBar";
 import { CategoryTags } from "@/components/chat/CategoryTags";
 import { StoryCard } from "@/components/chat/StoryCard";
 import { Pagination } from "@/components/chat/Pagination";
  import { AudioQuickControl } from "@/components/chat/AudioQuickControl";
import { StoryConfigDialog, type ConfigurableStory } from "@/components/story/StoryConfigDialog";
import { useStoryCustomizations } from "@/hooks/useStoryCustomizations";
 import { useStories, useCategories } from "@/hooks/useStories";
 import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useAdultMode } from "@/contexts/AdultModeContext";
import { AdultConsentDialog } from "@/components/adult/AdultConsentDialog";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Lock, Sparkles } from "lucide-react";
 import { Skeleton } from "@/components/ui/skeleton";
 
 type StoryType = "adventure" | "roleplay" | "real_sex";
 type StorySource = "crafted" | "custom";
 
 const Index = () => {
   const navigate = useNavigate();
   const { t } = useLanguage();
  const { user } = useAuth();
  const { enabled: adultEnabled, consentGiven, enable, grantConsent } = useAdultMode();
  const [consentOpen, setConsentOpen] = useState(false);
   const [storyType, setStoryType] = useState<StoryType>("roleplay");
   const [storySource, setStorySource] = useState<StorySource>("crafted");
   const [hasExplicit, setHasExplicit] = useState(false);
   const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
   const [currentPage, setCurrentPage] = useState(1);
 
   // Audio settings state
   const [voiceName, setVoiceName] = useState("scarlett-hd");
   const [genderFilter, setGenderFilter] = useState("All");
   const [styleFilter, setStyleFilter] = useState("All");
   const [isMuted, setIsMuted] = useState(false);
   const [autoplay, setAutoplay] = useState(true);
 
   const [configStory, setConfigStory] = useState<ConfigurableStory | null>(null);
   const { data: customizations, refetch: refetchCustomizations } = useStoryCustomizations();

   const { data: categoriesData } = useCategories();
   const { data: storiesData, isLoading } = useStories({
     type: storyType,
     source: storySource,
     hasExplicit: hasExplicit ? true : undefined,
     categoryIds: selectedCategories,
     page: currentPage,
     pageSize: 12,
   });
 
   // Reset page when filters change
   useEffect(() => {
     setCurrentPage(1);
   }, [storyType, storySource, hasExplicit, selectedCategories]);
 
   const handleCategoryToggle = (categoryId: string) => {
     setSelectedCategories((prev) =>
       prev.includes(categoryId)
         ? prev.filter((id) => id !== categoryId)
         : [...prev, categoryId]
     );
   };
 
   const handleStoryClick = (storyId: string) => {
    if (!user) {
      navigate("/login");
      return;
    }
     navigate(`/story/${storyId}`);
   };

  const handleTypeChange = (type: StoryType) => {
    if (type === "real_sex" && !adultEnabled) {
      if (consentGiven) {
        enable();
        setStoryType(type);
      } else {
        setConsentOpen(true);
      }
      return;
    }
    setStoryType(type);
  };

  const handleConsent = () => {
    grantConsent();
    enable();
    setConsentOpen(false);
    setStoryType("real_sex");
  };

  const realSexBlocked = storyType === "real_sex" && !adultEnabled;
 
   return (
     <MainLayout>
      <div className="container mx-auto px-4 py-8">
        {/* Hero — sello Insomnia con divisor decorativo */}
        <div className="relative mb-10">
          <div className="absolute inset-x-0 -top-4 mx-auto h-32 w-[80%] max-w-3xl rounded-full bg-gradient-to-r from-primary/20 via-accent/10 to-primary/20 blur-3xl pointer-events-none" />
          <div className="relative flex flex-col items-center">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-px w-10 bg-gradient-to-r from-transparent to-accent/60" />
              <span className="text-[10px] tracking-[0.5em] uppercase text-accent/80">
                Insomnia
              </span>
              <div className="h-px w-10 bg-gradient-to-l from-transparent to-accent/60" />
            </div>
            <h1 className="text-4xl md:text-5xl font-display italic text-center">
              <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
                Historias que no te dejan dormir
              </span>
            </h1>
            <p className="mt-3 text-sm text-muted-foreground max-w-xl mx-auto text-center">
              Relatos íntimos · Roleplay con IA · Fantasías a tu medida
            </p>
          </div>
        </div>

        {/* Toolbar superior: filtros + audio (todo arriba) */}
        <div className="mb-4 flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
          <div className="flex-1">
            <FilterBar
              storyType={storyType}
              storySource={storySource}
              hasExplicit={hasExplicit}
              onTypeChange={handleTypeChange}
              onSourceChange={setStorySource}
              onExplicitChange={setHasExplicit}
            />
          </div>
          <div className="flex justify-end">
            <AudioQuickControl
              voiceName={voiceName}
              genderFilter={genderFilter}
              styleFilter={styleFilter}
              isMuted={isMuted}
              autoplay={autoplay}
              onVoiceChange={setVoiceName}
              onGenderChange={setGenderFilter}
              onStyleChange={setStyleFilter}
              onMutedChange={setIsMuted}
              onAutoplayChange={setAutoplay}
            />
          </div>
        </div>
 
          {realSexBlocked && (
            <div className="max-w-2xl mx-auto my-12 text-center border border-destructive/30 bg-destructive/5 rounded-lg p-8">
              <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                <ShieldAlert className="w-7 h-7 text-destructive" />
              </div>
              <h2 className="text-xl font-display mb-2">{t("adult.gateTitle")}</h2>
              <p className="text-muted-foreground mb-6">{t("adult.gateDesc")}</p>
              <Button
                onClick={() => (consentGiven ? (enable()) : setConsentOpen(true))}
                variant="destructive"
              >
                {t("adult.enable")}
              </Button>
            </div>
          )}

          {!realSexBlocked && (<>
         {/* Category panel — desplegable, cuadrado, integrado */}
         {categoriesData && (
           <div className="max-w-6xl mx-auto mb-8">
             <CategoryTags
               categories={categoriesData}
               selectedCategories={selectedCategories}
               onCategoryToggle={handleCategoryToggle}
             />
           </div>
         )}
 
         {/* Pagination Top */}
         {storiesData && storiesData.totalPages > 1 && (
           <div className="mb-6">
             <Pagination
               currentPage={currentPage}
               totalPages={storiesData.totalPages}
               onPageChange={setCurrentPage}
             />
           </div>
         )}
 
         {/* Stories Grid — mosaico Insomnia */}
         <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
           {isLoading
             ? Array.from({ length: 10 }).map((_, i) => (
                 <Skeleton key={i} className="aspect-[4/5] rounded-none" />
               ))
             : storiesData?.stories.map((story, idx) => (
                 <StoryCard
                   key={story.id}
                   story={story}
                   index={idx}
                   coverOverride={customizations?.[story.id]?.cover_media_url ?? null}
                   onConfigure={
                     user
                       ? () => setConfigStory(story as ConfigurableStory)
                       : () => navigate("/login")
                   }
                   onClick={() => handleStoryClick(story.id)}
                 />
               ))}
         </div>
 
         {/* Empty State */}
         {!isLoading && storiesData?.stories.length === 0 && (
           <div className="text-center py-12">
              {storySource === "custom" && selectedCategories.length === 0 ? (
                <div className="max-w-md mx-auto p-8 rounded-lg border border-border bg-card">
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Sparkles className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="font-display text-xl mb-2">{t("custom.empty.title")}</h3>
                  <p className="text-muted-foreground mb-6">{t("custom.empty.desc")}</p>
                  <Button onClick={() => navigate("/studio")} className="gap-2">
                    <Sparkles className="w-4 h-4" />
                    {t("custom.empty.cta")}
                  </Button>
                </div>
              ) : storySource === "custom" ? (
                <div className="max-w-md mx-auto p-8 rounded-lg border border-border bg-card/60">
                  <p className="text-muted-foreground">
                    {t("custom.empty.filtered") || "Aún no hay historias personalizadas en esta categoría."}
                  </p>
                </div>
              ) : (
                <p className="text-muted-foreground">{t("chat.noStories")}</p>
              )}
           </div>
         )}
 
         {/* Pagination Bottom */}
         {storiesData && storiesData.totalPages > 1 && (
           <div className="mb-8">
             <Pagination
               currentPage={currentPage}
               totalPages={storiesData.totalPages}
               onPageChange={setCurrentPage}
             />
           </div>
         )}
 
          </>)}
       </div>
        <AdultConsentDialog
          open={consentOpen}
          onConfirm={handleConsent}
          onCancel={() => setConsentOpen(false)}
        />
        <StoryConfigDialog
          story={configStory}
          open={!!configStory}
          onOpenChange={(open) => !open && setConfigStory(null)}
          onSaved={() => refetchCustomizations()}
        />
     </MainLayout>
   );
 };
 
 export default Index;
