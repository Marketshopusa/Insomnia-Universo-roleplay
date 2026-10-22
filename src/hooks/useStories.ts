import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CATALOG_STORIES, CATALOG_CATEGORIES, type CatalogStory } from "@/data/catalogStories";
import { applyMotherCard } from "@/lib/roleplayBase";

type StoryType = "adventure" | "roleplay" | "real_sex";
type StorySource = "crafted" | "custom";

interface UseStoriesParams {
  type?: StoryType;
  source?: StorySource;
  hasExplicit?: boolean;
  categoryIds?: string[];
  page?: number;
  pageSize?: number;
}

const STORY_CARD_COLUMNS = "id, title, description, story_context, cover_image, player_role, character_role, video_count, image_count, has_explicit_images, story_type, source, created_by, created_at";

export const useStories = ({
  type,
  source = "crafted",
  hasExplicit,
  categoryIds = [],
  page = 1,
  pageSize = 12,
}: UseStoriesParams = {}) => {
  return useQuery({
    queryKey: ["stories", type, source, hasExplicit, categoryIds, page, pageSize],
    queryFn: async () => {
      // 1. Helper to query and paginate the 108 crafted stories from the official catalog
      const getCraftedCatalog = (extraRemoteStories: any[] = []) => {
        // Base list from catalog
        let list = [...CATALOG_STORIES];

        // Merge any remote crafted stories that aren't already in catalog
        const catalogIds = new Set(list.map((s) => s.id));
        for (const remote of extraRemoteStories) {
          if (remote && !catalogIds.has(remote.id)) {
            list.unshift(remote);
          }
        }

        // Apply filters
        if (type) {
          list = list.filter((s) => s.story_type === type);
        }
        if (hasExplicit !== undefined) {
          list = list.filter((s) => s.has_explicit_images === hasExplicit);
        }
        if (categoryIds.length > 0) {
          list = list.filter((s) => s.categories && s.categories.some((cid) => categoryIds.includes(cid)));
        }

        // Sort by created_at DESC so Page 1 matches exact layout:
        // N°01 The Voice on the Phone, N°02 Late Night Diner, N°03 The Gym Locker Room, etc.
        list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        const totalCount = list.length;
        const totalPages = Math.ceil(totalCount / pageSize);
        const from = (page - 1) * pageSize;
        const pageItems = list.slice(from, from + pageSize).map((item) => applyMotherCard(item));

        return {
          stories: pageItems,
          totalCount,
          totalPages,
        };
      };

      // 2. If requesting "crafted" (the official catalog), return the full sorted catalog
      if (source === "crafted") {
        // Try fetching any extra crafted stories from Supabase in the background without blocking
        try {
          const { data: remoteCrafted } = await supabase
            .from("stories")
            .select(STORY_CARD_COLUMNS)
            .eq("source", "crafted")
            .limit(30);

          return getCraftedCatalog(remoteCrafted || []);
        } catch {
          // If Supabase is restricted or slow, return official catalog immediately
          return getCraftedCatalog([]);
        }
      }

      // 3. If requesting "custom" (stories created by the user), query Supabase
      try {
        let query = supabase
          .from("stories")
          .select(STORY_CARD_COLUMNS, { count: "exact" })
          .eq("source", "custom");

        if (type) query = query.eq("story_type", type);
        if (hasExplicit !== undefined) query = query.eq("has_explicit_images", hasExplicit);

        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        const { data, error, count } = await query
          .order("created_at", { ascending: false })
          .range(from, to);

        if (error) {
          console.warn("Could not load custom stories from Supabase:", error.message);
          return { stories: [], totalCount: 0, totalPages: 0 };
        }

        return {
          stories: (data || []).map((item) => applyMotherCard(item as any)),
          totalCount: count || 0,
          totalPages: Math.ceil((count || 0) / pageSize),
        };
      } catch (err) {
        console.warn("Custom stories query error:", err);
        return { stories: [], totalCount: 0, totalPages: 0 };
      }
    },
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 2,
  });
};

export const useStory = (storyId: string) => {
  return useQuery({
    queryKey: ["story", storyId],
    queryFn: async () => {
      // 1. Check local catalog first for instant zero-latency loading
      const found = CATALOG_STORIES.find((s) => s.id === storyId);
      if (found) {
        return applyMotherCard({
          ...found,
          story_categories: (found.categories || []).map((catId) => {
            const cat = CATALOG_CATEGORIES.find((c) => c.id === catId);
            return {
              category_id: catId,
              categories: cat || { id: catId, name: "General", slug: "general" },
            };
          }),
        } as any);
      }

      // 2. If not found in catalog, query Supabase for custom user stories
      try {
        const { data, error } = await supabase
          .from("stories")
          .select(`
            *,
            story_categories (
              category_id,
              categories (
                id,
                name,
                slug
              )
            )
          `)
          .eq("id", storyId)
          .single();

        if (!error && data) {
          return applyMotherCard(data as any);
        }
      } catch (err) {
        console.warn("Failed fetching story from Supabase:", err);
      }

      return null;
    },
    enabled: !!storyId,
    staleTime: 1000 * 60 * 5,
  });
};

export const useCategories = () => {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("categories")
          .select("*")
          .order("name");

        if (!error && data && data.length > 0) {
          return data;
        }
      } catch (err) {
        console.warn("Using catalog categories fallback:", err);
      }

      return CATALOG_CATEGORIES;
    },
    staleTime: 1000 * 60 * 10,
  });
};
