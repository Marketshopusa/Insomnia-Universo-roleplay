import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

const STORY_CARD_COLUMNS = "id, title, description, cover_image, player_role, character_role, video_count, image_count, has_explicit_images, story_type, source, created_at";

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
      // If categories are selected, filter by them
      if (categoryIds.length > 0) {
        const { data: storyCategories, error: catError } = await supabase
          .from("story_categories")
          .select("story_id")
          .in("category_id", categoryIds);

        if (catError) throw catError;

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

        if (type) {
          query = query.eq("story_type", type);
        }
        if (source) {
          query = query.eq("source", source);
        }
        if (hasExplicit !== undefined) {
          query = query.eq("has_explicit_images", hasExplicit);
        }

        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        const { data, error, count } = await query
          .order("created_at", { ascending: false })
          .range(from, to);

        if (error) throw error;

        return {
          stories: data || [],
          totalCount: count || 0,
          totalPages: Math.ceil((count || 0) / pageSize),
        };
      }

      // No category filter - optimized query with specific columns
      let query = supabase
        .from("stories")
        .select(STORY_CARD_COLUMNS, { count: "exact" });

      if (type) {
        query = query.eq("story_type", type);
      }
      if (source) {
        query = query.eq("source", source);
      }
      if (hasExplicit !== undefined) {
        query = query.eq("has_explicit_images", hasExplicit);
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;

      return {
        stories: data || [],
        totalCount: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      };
    },
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 2,
  });
};

export const useStory = (storyId: string) => {
  return useQuery({
    queryKey: ["story", storyId],
    queryFn: async () => {
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

      if (error) throw error;
      return data;
    },
    enabled: !!storyId,
    staleTime: 1000 * 60 * 5,
  });
};

export const useCategories = () => {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("name");

      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60 * 10,
  });
};