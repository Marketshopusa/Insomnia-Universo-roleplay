 import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
 import { supabase } from "@/integrations/supabase/client";
 import { useAuth } from "@/contexts/AuthContext";
 
 interface NovelProject {
   id: string;
   title: string;
   description?: string | null;
   content?: string | null;
   outline?: string | null;
   chapter_count: number;
   language: string;
   model: string;
   creativity: string;
   is_safe_for_work: boolean;
   created_at: string;
   updated_at: string;
 }
 
 export const useNovelProjects = () => {
   const { user } = useAuth();
 
   return useQuery({
     queryKey: ["novel-projects", user?.id],
     queryFn: async () => {
       if (!user) return [];
 
       const { data, error } = await supabase
         .from("novel_projects")
         .select("*")
         .eq("user_id", user.id)
         .order("updated_at", { ascending: false });
 
       if (error) throw error;
       return data as NovelProject[];
     },
     enabled: !!user,
   });
 };
 
 export const useCreateNovelProject = () => {
   const queryClient = useQueryClient();
   const { user } = useAuth();
 
   return useMutation({
     mutationFn: async (projectData: Partial<NovelProject>) => {
       if (!user) throw new Error("Not authenticated");
 
       const { data, error } = await supabase
         .from("novel_projects")
         .insert({
           user_id: user.id,
           title: projectData.title || "Untitled Project",
           description: projectData.description,
           chapter_count: projectData.chapter_count || 7,
           language: projectData.language || "English",
           model: projectData.model || "Apprentice 6",
           creativity: projectData.creativity || "Balanced",
           is_safe_for_work: projectData.is_safe_for_work || false,
         })
         .select()
         .single();
 
       if (error) throw error;
       return data;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ["novel-projects"] });
     },
   });
 };
 
 export const useUpdateNovelProject = () => {
   const queryClient = useQueryClient();
 
   return useMutation({
     mutationFn: async ({ id, ...updates }: Partial<NovelProject> & { id: string }) => {
       const { data, error } = await supabase
         .from("novel_projects")
         .update(updates)
         .eq("id", id)
         .select()
         .single();
 
       if (error) throw error;
       return data;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ["novel-projects"] });
     },
   });
 };
 
 export const useDeleteNovelProject = () => {
   const queryClient = useQueryClient();
 
   return useMutation({
     mutationFn: async (id: string) => {
       const { error } = await supabase
         .from("novel_projects")
         .delete()
         .eq("id", id);
 
       if (error) throw error;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ["novel-projects"] });
     },
   });
 };