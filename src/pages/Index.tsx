import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { TypeTabs } from "@/components/chat/TypeTabs";
import { SourceTabs } from "@/components/chat/SourceTabs";
import { ExplicitToggle } from "@/components/chat/ExplicitToggle";
import { CategoryTags } from "@/components/chat/CategoryTags";
import { StoryCard } from "@/components/chat/StoryCard";
import { Pagination } from "@/components/chat/Pagination";
import { AudioSettings } from "@/components/chat/AudioSettings";
import { useStories, useCategories } from "@/hooks/useStories";
import { Skeleton } from "@/components/ui/skeleton";

type StoryType = "adventure" | "roleplay" | "real_sex";
type StorySource = "crafted" | "custom";

const Index = () => {
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

  const { data: categoriesData } = useCategories();
  const { data: storiesData, isLoading } = useStories({
    type: storyType,
    source: storySource,
    hasExplicit: hasExplicit ? true : undefined,
    page: currentPage,
    pageSize: 12,
  });

  const handleCategoryToggle = (categoryId: string) => {
    setSelectedCategories((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  return (
    <MainLayout>
      <div className="container mx-auto px-4 py-8">
        {/* Page Title */}
        <h1 className="text-3xl font-display text-center mb-8">Chat</h1>

        {/* Type Tabs */}
        <div className="max-w-2xl mx-auto mb-4">
          <TypeTabs activeType={storyType} onTypeChange={setStoryType} />
        </div>

        {/* Source Tabs */}
        <div className="max-w-md mx-auto mb-6">
          <SourceTabs activeSource={storySource} onSourceChange={setStorySource} />
        </div>

        {/* Explicit Toggle */}
        <div className="flex justify-center mb-6">
          <ExplicitToggle checked={hasExplicit} onCheckedChange={setHasExplicit} />
        </div>

        {/* Category Tags */}
        {categoriesData && (
          <div className="max-w-4xl mx-auto mb-8">
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

        {/* Stories Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
          {isLoading
            ? Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[3/4] rounded-lg" />
              ))
            : storiesData?.stories.map((story) => (
                <StoryCard key={story.id} story={story} />
              ))}
        </div>

        {/* Empty State */}
        {!isLoading && storiesData?.stories.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No stories found with the current filters.</p>
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

        {/* Audio Settings */}
        <div className="max-w-md mx-auto">
          <AudioSettings
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
    </MainLayout>
  );
};

export default Index;
