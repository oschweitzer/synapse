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
  synapse: {
    Tables: {
      calendar_events: {
        Row: {
          all_day: boolean
          calendar_id: string
          end_at: string
          event_id: string
          html_link: string | null
          location: string | null
          start_at: string
          title: string | null
          user_id: string
        }
        Insert: {
          all_day?: boolean
          calendar_id: string
          end_at: string
          event_id: string
          html_link?: string | null
          location?: string | null
          start_at: string
          title?: string | null
          user_id: string
        }
        Update: {
          all_day?: boolean
          calendar_id?: string
          end_at?: string
          event_id?: string
          html_link?: string | null
          location?: string | null
          start_at?: string
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      garmin_activities: {
        Row: {
          activity_id: number
          activity_type: string | null
          avg_hr: number | null
          calories: number | null
          distance_meters: number | null
          duration_seconds: number | null
          elevation_gain_meters: number | null
          max_hr: number | null
          name: string | null
          start_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_id: number
          activity_type?: string | null
          avg_hr?: number | null
          calories?: number | null
          distance_meters?: number | null
          duration_seconds?: number | null
          elevation_gain_meters?: number | null
          max_hr?: number | null
          name?: string | null
          start_at: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_id?: number
          activity_type?: string | null
          avg_hr?: number | null
          calories?: number | null
          distance_meters?: number | null
          duration_seconds?: number | null
          elevation_gain_meters?: number | null
          max_hr?: number | null
          name?: string | null
          start_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      garmin_daily: {
        Row: {
          awake_seconds: number | null
          body_battery_at_wake: number | null
          body_battery_charged: number | null
          body_battery_high: number | null
          body_battery_low: number | null
          day: string
          deep_sleep_seconds: number | null
          light_sleep_seconds: number | null
          rem_sleep_seconds: number | null
          resting_hr: number | null
          sleep_end_at: string | null
          sleep_score: number | null
          sleep_seconds: number | null
          sleep_start_at: string | null
          steps: number | null
          steps_goal: number | null
          updated_at: string
          user_id: string
          vo2max: number | null
        }
        Insert: {
          awake_seconds?: number | null
          body_battery_at_wake?: number | null
          body_battery_charged?: number | null
          body_battery_high?: number | null
          body_battery_low?: number | null
          day: string
          deep_sleep_seconds?: number | null
          light_sleep_seconds?: number | null
          rem_sleep_seconds?: number | null
          resting_hr?: number | null
          sleep_end_at?: string | null
          sleep_score?: number | null
          sleep_seconds?: number | null
          sleep_start_at?: string | null
          steps?: number | null
          steps_goal?: number | null
          updated_at?: string
          user_id: string
          vo2max?: number | null
        }
        Update: {
          awake_seconds?: number | null
          body_battery_at_wake?: number | null
          body_battery_charged?: number | null
          body_battery_high?: number | null
          body_battery_low?: number | null
          day?: string
          deep_sleep_seconds?: number | null
          light_sleep_seconds?: number | null
          rem_sleep_seconds?: number | null
          resting_hr?: number | null
          sleep_end_at?: string | null
          sleep_score?: number | null
          sleep_seconds?: number | null
          sleep_start_at?: string | null
          steps?: number | null
          steps_goal?: number | null
          updated_at?: string
          user_id?: string
          vo2max?: number | null
        }
        Relationships: []
      }
      google_accounts: {
        Row: {
          connected_at: string
          google_email: string | null
          needs_reauth: boolean
          scopes: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          connected_at?: string
          google_email?: string | null
          needs_reauth?: boolean
          scopes?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          connected_at?: string
          google_email?: string | null
          needs_reauth?: boolean
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
      habit_checks: {
        Row: {
          created_at: string
          day: string
          habit_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day: string
          habit_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          day?: string
          habit_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habit_checks_habit_id_user_id_fkey"
            columns: ["habit_id", "user_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      habits: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          name: string
          position: number
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          name: string
          position?: number
          user_id?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          name?: string
          position?: number
          user_id?: string
        }
        Relationships: []
      }
      mail_headers: {
        Row: {
          is_unread: boolean
          message_id: string
          received_at: string
          sender: string | null
          snippet: string | null
          subject: string | null
          thread_id: string
          user_id: string
        }
        Insert: {
          is_unread?: boolean
          message_id: string
          received_at: string
          sender?: string | null
          snippet?: string | null
          subject?: string | null
          thread_id: string
          user_id: string
        }
        Update: {
          is_unread?: boolean
          message_id?: string
          received_at?: string
          sender?: string | null
          snippet?: string | null
          subject?: string | null
          thread_id?: string
          user_id?: string
        }
        Relationships: []
      }
      meal_plan: {
        Row: {
          created_at: string
          day: string
          recipe_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day: string
          recipe_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          day?: string
          recipe_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      mindmaps: {
        Row: {
          created_at: string
          edges: Json
          id: string
          nodes: Json
          title: string
          updated_at: string
          user_id: string
          viewport: Json | null
        }
        Insert: {
          created_at?: string
          edges?: Json
          id?: string
          nodes?: Json
          title: string
          updated_at?: string
          user_id?: string
          viewport?: Json | null
        }
        Update: {
          created_at?: string
          edges?: Json
          id?: string
          nodes?: Json
          title?: string
          updated_at?: string
          user_id?: string
          viewport?: Json | null
        }
        Relationships: []
      }
      mood_entries: {
        Row: {
          created_at: string
          day: string
          note: string | null
          score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day: string
          note?: string | null
          score: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          day?: string
          note?: string | null
          score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recipes: {
        Row: {
          created_at: string
          id: string
          ingredients: string[]
          mealdb_id: string | null
          source_url: string | null
          steps: string[]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ingredients?: string[]
          mealdb_id?: string | null
          source_url?: string | null
          steps?: string[]
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          ingredients?: string[]
          mealdb_id?: string | null
          source_url?: string | null
          steps?: string[]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      schema_migrations: {
        Row: {
          applied_at: string
          checksum: string
          name: string
        }
        Insert: {
          applied_at?: string
          checksum: string
          name: string
        }
        Update: {
          applied_at?: string
          checksum?: string
          name?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          cairn_shopping_checklist_id: string | null
          cash_sheet_id: string | null
          created_at: string
          updated_at: string
          user_id: string
          weather_label: string | null
          weather_latitude: number | null
          weather_longitude: number | null
          widget_order: string[]
        }
        Insert: {
          cairn_shopping_checklist_id?: string | null
          cash_sheet_id?: string | null
          created_at?: string
          updated_at?: string
          user_id?: string
          weather_label?: string | null
          weather_latitude?: number | null
          weather_longitude?: number | null
          widget_order?: string[]
        }
        Update: {
          cairn_shopping_checklist_id?: string | null
          cash_sheet_id?: string | null
          created_at?: string
          updated_at?: string
          user_id?: string
          weather_label?: string | null
          weather_latitude?: number | null
          weather_longitude?: number | null
          widget_order?: string[]
        }
        Relationships: []
      }
      sync_runs: {
        Row: {
          error: string | null
          finished_at: string | null
          id: number
          source: string
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: never
          source: string
          started_at?: string
          status?: string
          user_id: string
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: never
          source?: string
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      weather_locations: {
        Row: {
          created_at: string
          id: string
          label: string
          latitude: number
          longitude: number
          position: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          latitude: number
          longitude: number
          position?: number
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          latitude?: number
          longitude?: number
          position?: number
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      disconnect_google: { Args: never; Returns: undefined }
      flag_google_reauth: { Args: never; Returns: undefined }
      google_refresh_token: { Args: never; Returns: string }
      pick_daily_recipe: { Args: { p_day: string }; Returns: string }
      replace_google_cache: {
        Args: { p_events: Json; p_mails: Json; p_user_id: string }
        Returns: undefined
      }
      save_google_connection: {
        Args: {
          p_google_email: string
          p_refresh_token_encrypted: string
          p_scopes: string[]
        }
        Returns: undefined
      }
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
  synapse: {
    Enums: {},
  },
} as const
