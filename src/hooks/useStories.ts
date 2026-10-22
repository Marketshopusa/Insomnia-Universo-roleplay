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
  source,
  hasExplicit,
  categoryIds = [],
  page = 1,
  pageSize = 12,
}: UseStoriesParams = {}) => {
  return useQuery({
    queryKey: ["stories", type, source, hasExplicit, categoryIds, page, pageSize],
    queryFn: async () => {
      // Helper function to query the local catalog with filters & pagination
      const queryLocalCatalog = () => {
        let list = [...CATALOG_STORIES];

        if (type) {
          list = list.filter((s) => s.story_type === type);
        }
        if (source) {
          list = list.filter((s) => s.source === source);
        }
        if (hasExplicit !== undefined) {
          list = list.filter((s) => s.has_explicit_images === hasExplicit);
        }
        if (categoryIds.length > 0) {
          list = list.filter((s) => s.categories && s.categories.some((cid) => categoryIds.includes(cid)));
        }

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

      try {
        // If categories are selected, filter by them
        if (categoryIds.length > 0) {
          const { data: storyCategories, error: catError } = await supabase
            .from("story_categories")
            .select("story_id")
            .in("category_id", categoryIds);

          if (catError) {
            console.warn("Supabase category filter unavailable, using local catalog fallback:", catError.message);
            return queryLocalCatalog();
          }

          const storyIds = [...new Set(storyCategories?.map((sc) => sc.story_id) || [])];

          if (storyIds.length === 0) {
            return {
              stories: [],
              totalCount: 0,
              totalPages: 0,
            };
          }

          let query = supabase
            .from("stories")
            .select(STORY_CARD_COLUMNS, { count: "exact" })
            .in("id", storyIds);

          if (type) query = query.eq("story_type", type);
          if (source) query = query.eq("source", source);
          if (hasExplicit !== undefined) query = query.eq("has_explicit_images", hasExplicit);

          const from = (page - 1) * pageSize;
          const to = from + pageSize - 1;

          const { data, error, count } = await query
            .order("created_at", { ascending: false })
            .range(from, to);

          if (error) {
            console.warn("Supabase stories query unavailable, using local catalog fallback:", error.message);
            return queryLocalCatalog();
          }

          if (!data || data.length === 0) {
            return queryLocalCatalog();
          }

          return {
            stories: data.map((item) => applyMotherCard(item as any)),
            totalCount: count || data.length,
            totalPages: Math.ceil((count || data.length) / pageSize),
          };
        }

        // No category filter - try remote Supabase query
        let query = supabase
          .from("stories")
          .select(STORY_CARD_COLUMNS, { count: "exact" });

        if (type) query = query.eq("story_type", type);
        if (source) query = query.eq("source", source);
        if (hasExplicit !== undefined) query = query.eq("has_explicit_images", hasExplicit);

        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        const { data, error, count } = await query
          .order("created_at", { ascending: false })
          .range(from, to);

        if (error) {
          console.warn("Supabase query restricted or failed, falling back to local catalog:", error.message);
          return queryLocalCatalog();
        }

        if (!data || data.length === 0) {
          return queryLocalCatalog();
        }

        return {
          stories: data.map((item) => applyMotherCard(item as any)),
          totalCount: count || data.length,
          totalPages: Math.ceil((count || data.length) / pageSize),
        };
      } catch (err) {
        console.warn("Network or quota error querying stories, using robust local catalog:", err);
        return queryLocalCatalog();
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
        console.warn("Failed fetching story from Supabase, checking catalog:", err);
      }

      // Check local catalog fallback
      const found = CATALOG_STORIES.find((s) => s.id === storyId);
      if (found) {
        return applyMotherCard({
          ...found,
          story_categories: found.categories.map((catId) => {
            const cat = CATALOG_CATEGORIES.find((c) => c.id === catId);
            return {
              category_id: catId,
              categories: cat || { id: catId, name: "General", slug: "general" },
            };
          }),
        } as any);
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
        console.warn("Failed fetching categories from Supabase, using catalog categories:", err);
      }

      return CATALOG_CATEGORIES;
    },
    staleTime: 1000 * 60 * 10,
  });
};
