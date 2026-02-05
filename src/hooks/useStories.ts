 import { useQuery } from "@tanstack/react-query";
 import { supabase } from "@/integrations/supabase/client";
 
 type StoryType = "adventure" | "roleplay" | "real_sex";
 type StorySource = "crafted" | "custom";
 
 interface UseStoriesParams {
   type?: StoryType;
   source?: StorySource;
   hasExplicit?: boolean;
   page?: number;
   pageSize?: number;
 }
 
 export const useStories = ({
   type,
   source,
   hasExplicit,
   page = 1,
   pageSize = 12,
 }: UseStoriesParams = {}) => {
   return useQuery({
     queryKey: ["stories", type, source, hasExplicit, page, pageSize],
     queryFn: async () => {
       let query = supabase
         .from("stories")
         .select("*", { count: "exact" });
 
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
   });
 };