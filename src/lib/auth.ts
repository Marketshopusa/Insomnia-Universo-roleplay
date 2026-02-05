 import { supabase } from "@/integrations/supabase/client";
 
 export type AuthState = {
   user: any | null;
   loading: boolean;
 };
 
 export const signUp = async (email: string, password: string, username?: string) => {
   const { data, error } = await supabase.auth.signUp({
     email,
     password,
     options: {
       emailRedirectTo: window.location.origin,
       data: {
         username: username || email.split('@')[0],
       },
     },
   });
   return { data, error };
 };
 
 export const signIn = async (email: string, password: string) => {
   const { data, error } = await supabase.auth.signInWithPassword({
     email,
     password,
   });
   return { data, error };
 };
 
 export const signOut = async () => {
   const { error } = await supabase.auth.signOut();
   return { error };
 };
 
 export const getCurrentUser = async () => {
   const { data: { user }, error } = await supabase.auth.getUser();
   return { user, error };
 };