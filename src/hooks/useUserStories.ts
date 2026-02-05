 import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
 import { supabase } from "@/integrations/supabase/client";
 import { useAuth } from "@/contexts/AuthContext";
 
 export const useUserStories = () => {
   const { user } = useAuth();
 
   return useQuery({
     queryKey: ["user-stories", user?.id],
     queryFn: async () => {
       if (!user) return [];
 
       const { data, error } = await supabase
         .from("user_stories")
         .select("*")
         .eq("user_id", user.id)
         .order("updated_at", { ascending: false });
 
       if (error) throw error;
       return data || [];
     },
     enabled: !!user,
   });
 };
 
 export const useCreateUserStory = () => {
   const queryClient = useQueryClient();
   const { user } = useAuth();
 
   return useMutation({
     mutationFn: async (storyData: { title: string; content?: string; story_type?: "adventure" | "roleplay" | "real_sex" }) => {
       if (!user) throw new Error("Not authenticated");
 
       const { data, error } = await supabase
         .from("user_stories")
         .insert({
           user_id: user.id,
           title: storyData.title,
           content: storyData.content || "",
           story_type: storyData.story_type || "roleplay",
         })
         .select()
         .single();
 
       if (error) throw error;
       return data;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ["user-stories"] });
     },
   });
 };
 
 export const useUpdateUserStory = () => {
   const queryClient = useQueryClient();
 
   return useMutation({
     mutationFn: async ({ id, ...updates }: { id: string; title?: string; content?: string }) => {
       const { data, error } = await supabase
         .from("user_stories")
         .update(updates)
         .eq("id", id)
         .select()
         .single();
 
       if (error) throw error;
       return data;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ["user-stories"] });
     },
   });
 };
 
 export const useDeleteUserStory = () => {
   const queryClient = useQueryClient();
 
   return useMutation({
     mutationFn: async (id: string) => {
       const { error } = await supabase
         .from("user_stories")
         .delete()
         .eq("id", id);
 
       if (error) throw error;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ["user-stories"] });
     },
   });
 };