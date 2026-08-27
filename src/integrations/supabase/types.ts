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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      news_discovery: {
        Row: {
          created_at: string
          error: string | null
          feed_item_id: string | null
          gate_result: string | null
          id: string
          pdf_path: string | null
          pdf_url: string | null
          scouted_at: string
          source_domain: string
          source_url: string
          status: string
          title: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          feed_item_id?: string | null
          gate_result?: string | null
          id?: string
          pdf_path?: string | null
          pdf_url?: string | null
          scouted_at?: string
          source_domain: string
          source_url: string
          status?: string
          title: string
        }
        Update: {
          created_at?: string
          error?: string | null
          feed_item_id?: string | null
          gate_result?: string | null
          id?: string
          pdf_path?: string | null
          pdf_url?: string | null
          scouted_at?: string
          source_domain?: string
          source_url?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      news_gate_log: {
        Row: {
          checked_at: string
          details: Json
          gate_result: string
          id: string
          news_id: string | null
        }
        Insert: {
          checked_at?: string
          details?: Json
          gate_result: string
          id?: string
          news_id?: string | null
        }
        Update: {
          checked_at?: string
          details?: Json
          gate_result?: string
          id?: string
          news_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "news_gate_log_news_id_fkey"
            columns: ["news_id"]
            isOneToOne: false
            referencedRelation: "news_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_gate_log_news_id_fkey"
            columns: ["news_id"]
            isOneToOne: false
            referencedRelation: "v_attualita"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_gate_log_news_id_fkey"
            columns: ["news_id"]
            isOneToOne: false
            referencedRelation: "v_biblioteca"
            referencedColumns: ["id"]
          },
        ]
      }
      news_items: {
        Row: {
          author_type: string
          category: string | null
          content_markdown: string | null
          country: string | null
          created_at: string
          fetched_at: string | null
          flag_pending_review: boolean
          gate_result: Json | null
          geo: string
          id: string
          language: string
          normative_references: Json
          pdf_url: string | null
          primary_source_verified_at: string | null
          published_at: string | null
          reviewed_by: string | null
          slug: string
          source_kind: string
          source_name: string | null
          source_tier: string
          source_url: string | null
          status: string
          summary: string | null
          title: string
          topic: string
          updated_at: string
        }
        Insert: {
          author_type?: string
          category?: string | null
          content_markdown?: string | null
          country?: string | null
          created_at?: string
          fetched_at?: string | null
          flag_pending_review?: boolean
          gate_result?: Json | null
          geo?: string
          id?: string
          language?: string
          normative_references?: Json
          pdf_url?: string | null
          primary_source_verified_at?: string | null
          published_at?: string | null
          reviewed_by?: string | null
          slug: string
          source_kind?: string
          source_name?: string | null
          source_tier?: string
          source_url?: string | null
          status?: string
          summary?: string | null
          title: string
          topic?: string
          updated_at?: string
        }
        Update: {
          author_type?: string
          category?: string | null
          content_markdown?: string | null
          country?: string | null
          created_at?: string
          fetched_at?: string | null
          flag_pending_review?: boolean
          gate_result?: Json | null
          geo?: string
          id?: string
          language?: string
          normative_references?: Json
          pdf_url?: string | null
          primary_source_verified_at?: string | null
          published_at?: string | null
          reviewed_by?: string | null
          slug?: string
          source_kind?: string
          source_name?: string | null
          source_tier?: string
          source_url?: string | null
          status?: string
          summary?: string | null
          title?: string
          topic?: string
          updated_at?: string
        }
        Relationships: []
      }
      news_sources: {
        Row: {
          category: string
          country: string | null
          created_at: string
          enabled: boolean
          feed_url: string | null
          id: string
          name: string
          watch_type: string
        }
        Insert: {
          category: string
          country?: string | null
          created_at?: string
          enabled?: boolean
          feed_url?: string | null
          id?: string
          name: string
          watch_type?: string
        }
        Update: {
          category?: string
          country?: string | null
          created_at?: string
          enabled?: boolean
          feed_url?: string | null
          id?: string
          name?: string
          watch_type?: string
        }
        Relationships: []
      }
      normative: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          url_official: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          url_official?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          url_official?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      v_attualita: {
        Row: {
          author_type: string | null
          category: string | null
          content_markdown: string | null
          country: string | null
          created_at: string | null
          geo: string | null
          id: string | null
          language: string | null
          normative_references: Json | null
          pdf_url: string | null
          primary_source_verified_at: string | null
          published_at: string | null
          reviewed_by: string | null
          slug: string | null
          source_kind: string | null
          source_name: string | null
          source_tier: string | null
          source_url: string | null
          summary: string | null
          title: string | null
          topic: string | null
          updated_at: string | null
        }
        Insert: {
          author_type?: string | null
          category?: string | null
          content_markdown?: string | null
          country?: string | null
          created_at?: string | null
          geo?: string | null
          id?: string | null
          language?: string | null
          normative_references?: Json | null
          pdf_url?: string | null
          primary_source_verified_at?: string | null
          published_at?: string | null
          reviewed_by?: string | null
          slug?: string | null
          source_kind?: string | null
          source_name?: string | null
          source_tier?: string | null
          source_url?: string | null
          summary?: string | null
          title?: string | null
          topic?: string | null
          updated_at?: string | null
        }
        Update: {
          author_type?: string | null
          category?: string | null
          content_markdown?: string | null
          country?: string | null
          created_at?: string | null
          geo?: string | null
          id?: string | null
          language?: string | null
          normative_references?: Json | null
          pdf_url?: string | null
          primary_source_verified_at?: string | null
          published_at?: string | null
          reviewed_by?: string | null
          slug?: string | null
          source_kind?: string | null
          source_name?: string | null
          source_tier?: string | null
          source_url?: string | null
          summary?: string | null
          title?: string | null
          topic?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      v_biblioteca: {
        Row: {
          category: string | null
          country: string | null
          id: string | null
          pdf_url: string | null
          published_at: string | null
          source_name: string | null
          source_url: string | null
          title: string | null
        }
        Insert: {
          category?: string | null
          country?: string | null
          id?: string | null
          pdf_url?: string | null
          published_at?: string | null
          source_name?: string | null
          source_url?: string | null
          title?: string | null
        }
        Update: {
          category?: string | null
          country?: string | null
          id?: string | null
          pdf_url?: string | null
          published_at?: string | null
          source_name?: string | null
          source_url?: string | null
          title?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
