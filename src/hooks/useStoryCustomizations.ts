import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface StoryCustomization {
  story_id: string;
  cover_media_url: string | null;
  cover_media_type: string | null;
  voice: string | null;
}

/** Personal cover and voice choices the signed-in user made for any story card. */
export const useStoryCustomizations = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["story-customizations", user?.id],
    queryFn: async () => {
      if (!user) return {} as Record<string, StoryCustomization>;
      const { data, error } = await supabase
        .from("story_customizations")
        .select("story_id, cover_media_url, cover_media_type, voice")
        .eq("user_id", user.id);
      if (error) throw error;
      const map: Record<string, StoryCustomization> = {};
      (data || []).forEach((row) => {
        map[row.story_id] = row as StoryCustomization;
      });
      return map;
    },
    enabled: !!user,
  });
};
