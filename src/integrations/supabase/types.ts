export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      novel_projects: {
        Row: {
          chapter_count: number | null
          content: string | null
          created_at: string
          creativity: string | null
          description: string | null
          id: string
          is_safe_for_work: boolean | null
          language: string | null
          model: string | null
          outline: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          chapter_count?: number | null
          content?: string | null
          created_at?: string
          creativity?: string | null
          description?: string | null
          id?: string
          is_safe_for_work?: boolean | null
          language?: string | null
          model?: string | null
          outline?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          chapter_count?: number | null
          content?: string | null
          created_at?: string
          creativity?: string | null
          description?: string | null
          id?: string
          is_safe_for_work?: boolean | null
          language?: string | null
          model?: string | null
          outline?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          credits: number | null
          id: string
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          credits?: number | null
          id?: string
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          credits?: number | null
          id?: string
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      stories: {
        Row: {
          character_role: string | null
          cover_image: string | null
          created_at: string
          created_by: string | null
          description: string | null
          has_explicit_images: boolean | null
          id: string
          image_count: number | null
          is_featured: boolean | null
          player_role: string | null
          source: Database["public"]["Enums"]["story_source"]
          story_type: Database["public"]["Enums"]["story_type"]
          title: string
          updated_at: string
          video_count: number | null
        }
        Insert: {
          character_role?: string | null
          cover_image?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          has_explicit_images?: boolean | null
          id?: string
          image_count?: number | null
          is_featured?: boolean | null
          player_role?: string | null
          source?: Database["public"]["Enums"]["story_source"]
          story_type?: Database["public"]["Enums"]["story_type"]
          title: string
          updated_at?: string
          video_count?: number | null
        }
        Update: {
          character_role?: string | null
          cover_image?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          has_explicit_images?: boolean | null
          id?: string
          image_count?: number | null
          is_featured?: boolean | null
          player_role?: string | null
          source?: Database["public"]["Enums"]["story_source"]
          story_type?: Database["public"]["Enums"]["story_type"]
          title?: string
          updated_at?: string
          video_count?: number | null
        }
        Relationships: []
      }
      story_categories: {
        Row: {
          category_id: string
          id: string
          story_id: string
        }
        Insert: {
          category_id: string
          id?: string
          story_id: string
        }
        Update: {
          category_id?: string
          id?: string
          story_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_categories_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      story_sessions: {
        Row: {
          created_at: string
          id: string
          last_mode: string | null
          messages: Json
          narrative: string | null
          story_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_mode?: string | null
          messages?: Json
          narrative?: string | null
          story_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_mode?: string | null
          messages?: Json
          narrative?: string | null
          story_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_stories: {
        Row: {
          content: string | null
          cover_media_type: string | null
          cover_media_url: string | null
          created_at: string
          id: string
          is_public: boolean | null
          story_type: Database["public"]["Enums"]["story_type"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string | null
          cover_media_type?: string | null
          cover_media_url?: string | null
          created_at?: string
          id?: string
          is_public?: boolean | null
          story_type?: Database["public"]["Enums"]["story_type"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string | null
          cover_media_type?: string | null
          cover_media_url?: string | null
          created_at?: string
          id?: string
          is_public?: boolean | null
          story_type?: Database["public"]["Enums"]["story_type"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      voice_settings: {
        Row: {
          autoplay: boolean | null
          created_at: string
          gender_filter: string | null
          id: string
          is_muted: boolean | null
          style_filter: string | null
          updated_at: string
          user_id: string
          voice_name: string | null
        }
        Insert: {
          autoplay?: boolean | null
          created_at?: string
          gender_filter?: string | null
          id?: string
          is_muted?: boolean | null
          style_filter?: string | null
          updated_at?: string
          user_id: string
          voice_name?: string | null
        }
        Update: {
          autoplay?: boolean | null
          created_at?: string
          gender_filter?: string | null
          id?: string
          is_muted?: boolean | null
          style_filter?: string | null
          updated_at?: string
          user_id?: string
          voice_name?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      story_source: "crafted" | "custom"
      story_type: "adventure" | "roleplay" | "real_sex"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      story_source: ["crafted", "custom"],
      story_type: ["adventure", "roleplay", "real_sex"],
    },
  },
} as const
