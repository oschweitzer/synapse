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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      checklist_items: {
        Row: {
          ciphertext: string | null
          content: string | null
          created_at: string
          due_at: string | null
          id: string
          is_done: boolean
          is_encrypted: boolean
          note_id: string
          position: number
          updated_at: string
          user_id: string
        }
        Insert: {
          ciphertext?: string | null
          content?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          is_done?: boolean
          is_encrypted?: boolean
          note_id: string
          position?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          ciphertext?: string | null
          content?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          is_done?: boolean
          is_encrypted?: boolean
          note_id?: string
          position?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_note_id_user_id_fkey"
            columns: ["note_id", "user_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      google_accounts: {
        Row: {
          connected_at: string
          google_email: string | null
          needs_reauth: boolean
          refresh_expires_at: string | null
          scopes: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          connected_at?: string
          google_email?: string | null
          needs_reauth?: boolean
          refresh_expires_at?: string | null
          scopes?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          connected_at?: string
          google_email?: string | null
          needs_reauth?: boolean
          refresh_expires_at?: string | null
          scopes?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      google_credentials: {
        Row: {
          refresh_token_encrypted: string
          updated_at: string
          user_id: string
        }
        Insert: {
          refresh_token_encrypted: string
          updated_at?: string
          user_id: string
        }
        Update: {
          refresh_token_encrypted?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      note_tags: {
        Row: {
          note_id: string
          tag_id: string
          user_id: string
        }
        Insert: {
          note_id: string
          tag_id: string
          user_id?: string
        }
        Update: {
          note_id?: string
          tag_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_tags_note_id_user_id_fkey"
            columns: ["note_id", "user_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "note_tags_tag_id_user_id_fkey"
            columns: ["tag_id", "user_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      notes: {
        Row: {
          body: string | null
          ciphertext: string | null
          code_name: string | null
          color_key: Database["public"]["Enums"]["tag_color"] | null
          created_at: string
          deleted_at: string | null
          hide_content: boolean
          id: string
          is_archived: boolean
          is_encrypted: boolean
          is_pinned: boolean
          is_private: boolean
          kind: Database["public"]["Enums"]["note_kind"]
          position: number
          search_vector: unknown
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          ciphertext?: string | null
          code_name?: string | null
          color_key?: Database["public"]["Enums"]["tag_color"] | null
          created_at?: string
          deleted_at?: string | null
          hide_content?: boolean
          id?: string
          is_archived?: boolean
          is_encrypted?: boolean
          is_pinned?: boolean
          is_private?: boolean
          kind?: Database["public"]["Enums"]["note_kind"]
          position?: number
          search_vector?: unknown
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          body?: string | null
          ciphertext?: string | null
          code_name?: string | null
          color_key?: Database["public"]["Enums"]["tag_color"] | null
          created_at?: string
          deleted_at?: string | null
          hide_content?: boolean
          id?: string
          is_archived?: boolean
          is_encrypted?: boolean
          is_pinned?: boolean
          is_private?: boolean
          kind?: Database["public"]["Enums"]["note_kind"]
          position?: number
          search_vector?: unknown
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          theme_preference: Database["public"]["Enums"]["theme_preference"]
          updated_at: string
          widget_force_dark: boolean
          widget_show_private: boolean
        }
        Insert: {
          created_at?: string
          id: string
          theme_preference?: Database["public"]["Enums"]["theme_preference"]
          updated_at?: string
          widget_force_dark?: boolean
          widget_show_private?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          theme_preference?: Database["public"]["Enums"]["theme_preference"]
          updated_at?: string
          widget_force_dark?: boolean
          widget_show_private?: boolean
        }
        Relationships: []
      }
      reminders: {
        Row: {
          attempts: number
          checklist_item_id: string | null
          created_at: string
          ends_at: string | null
          google_html_link: string | null
          google_id: string | null
          google_kind: Database["public"]["Enums"]["google_target"] | null
          id: string
          last_error: string | null
          last_synced_at: string | null
          local_notification_id: string | null
          note_id: string | null
          remind_at: string
          sync_state: Database["public"]["Enums"]["sync_state"]
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          checklist_item_id?: string | null
          created_at?: string
          ends_at?: string | null
          google_html_link?: string | null
          google_id?: string | null
          google_kind?: Database["public"]["Enums"]["google_target"] | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          local_notification_id?: string | null
          note_id?: string | null
          remind_at: string
          sync_state?: Database["public"]["Enums"]["sync_state"]
          updated_at?: string
          user_id?: string
        }
        Update: {
          attempts?: number
          checklist_item_id?: string | null
          created_at?: string
          ends_at?: string | null
          google_html_link?: string | null
          google_id?: string | null
          google_kind?: Database["public"]["Enums"]["google_target"] | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          local_notification_id?: string | null
          note_id?: string | null
          remind_at?: string
          sync_state?: Database["public"]["Enums"]["sync_state"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_note_id_user_id_fkey"
            columns: ["note_id", "user_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      tags: {
        Row: {
          color_key: Database["public"]["Enums"]["tag_color"]
          created_at: string
          id: string
          name: string
          position: number
          user_id: string
        }
        Insert: {
          color_key?: Database["public"]["Enums"]["tag_color"]
          created_at?: string
          id?: string
          name: string
          position?: number
          user_id?: string
        }
        Update: {
          color_key?: Database["public"]["Enums"]["tag_color"]
          created_at?: string
          id?: string
          name?: string
          position?: number
          user_id?: string
        }
        Relationships: []
      }
      vault_keys: {
        Row: {
          created_at: string
          updated_at: string
          user_id: string
          wrapped_key: string
        }
        Insert: {
          created_at?: string
          updated_at?: string
          user_id?: string
          wrapped_key: string
        }
        Update: {
          created_at?: string
          updated_at?: string
          user_id?: string
          wrapped_key?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_own_account: { Args: never; Returns: undefined }
      reorder_checklist_items: {
        Args: { p_ids: string[]; p_note_id: string }
        Returns: undefined
      }
      reorder_notes: { Args: { p_ids: string[] }; Returns: undefined }
    }
    Enums: {
      google_target: "task" | "event"
      note_kind: "note" | "checklist"
      sync_state: "pending" | "synced" | "error" | "disabled"
      tag_color:
        | "ambre"
        | "braise"
        | "airelle"
        | "bruyere"
        | "fjord"
        | "aurore"
        | "lichen"
        | "fer"
        | "bouleau"
        | "granit"
      theme_preference: "dark" | "light" | "system"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      google_target: ["task", "event"],
      note_kind: ["note", "checklist"],
      sync_state: ["pending", "synced", "error", "disabled"],
      tag_color: [
        "ambre",
        "braise",
        "airelle",
        "bruyere",
        "fjord",
        "aurore",
        "lichen",
        "fer",
        "bouleau",
        "granit",
      ],
      theme_preference: ["dark", "light", "system"],
    },
  },
} as const
