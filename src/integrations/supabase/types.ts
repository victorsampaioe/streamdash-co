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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alert_channels: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          kind: Database["public"]["Enums"]["alert_kind"]
          name: string
          owner_id: string
          target: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          kind: Database["public"]["Enums"]["alert_kind"]
          name: string
          owner_id: string
          target: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          kind?: Database["public"]["Enums"]["alert_kind"]
          name?: string
          owner_id?: string
          target?: string
        }
        Relationships: []
      }
      checks: {
        Row: {
          checked_at: string
          dns_resolved_ip: string | null
          error: string | null
          http_status: number | null
          id: number
          latency_ms: number | null
          server_id: string
          ssl_days_remaining: number | null
          status: Database["public"]["Enums"]["server_status"]
        }
        Insert: {
          checked_at?: string
          dns_resolved_ip?: string | null
          error?: string | null
          http_status?: number | null
          id?: number
          latency_ms?: number | null
          server_id: string
          ssl_days_remaining?: number | null
          status: Database["public"]["Enums"]["server_status"]
        }
        Update: {
          checked_at?: string
          dns_resolved_ip?: string | null
          error?: string | null
          http_status?: number | null
          id?: number
          latency_ms?: number | null
          server_id?: string
          ssl_days_remaining?: number | null
          status?: Database["public"]["Enums"]["server_status"]
        }
        Relationships: [
          {
            foreignKeyName: "checks_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          ended_at: string | null
          id: string
          notified: boolean
          reason: string | null
          server_id: string
          started_at: string
        }
        Insert: {
          ended_at?: string | null
          id?: string
          notified?: boolean
          reason?: string | null
          server_id: string
          started_at?: string
        }
        Update: {
          ended_at?: string | null
          id?: string
          notified?: boolean
          reason?: string | null
          server_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications_log: {
        Row: {
          channel_id: string | null
          event: string
          id: number
          incident_id: string | null
          ok: boolean
          response: string | null
          sent_at: string
          server_id: string | null
        }
        Insert: {
          channel_id?: string | null
          event: string
          id?: number
          incident_id?: string | null
          ok: boolean
          response?: string | null
          sent_at?: string
          server_id?: string | null
        }
        Update: {
          channel_id?: string | null
          event?: string
          id?: number
          incident_id?: string | null
          ok?: boolean
          response?: string | null
          sent_at?: string
          server_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_log_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "alert_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_log_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_log_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      servers: {
        Row: {
          category: string | null
          consecutive_failures: number
          created_at: string
          current_status: Database["public"]["Enums"]["server_status"]
          description: string | null
          failure_threshold: number
          host: string
          id: string
          interval_seconds: number
          is_public: boolean
          last_checked_at: string | null
          last_latency_ms: number | null
          name: string
          owner_id: string
          public_slug: string | null
          ssl_days_remaining: number | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          consecutive_failures?: number
          created_at?: string
          current_status?: Database["public"]["Enums"]["server_status"]
          description?: string | null
          failure_threshold?: number
          host: string
          id?: string
          interval_seconds?: number
          is_public?: boolean
          last_checked_at?: string | null
          last_latency_ms?: number | null
          name: string
          owner_id: string
          public_slug?: string | null
          ssl_days_remaining?: number | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          consecutive_failures?: number
          created_at?: string
          current_status?: Database["public"]["Enums"]["server_status"]
          description?: string | null
          failure_threshold?: number
          host?: string
          id?: string
          interval_seconds?: number
          is_public?: boolean
          last_checked_at?: string | null
          last_latency_ms?: number | null
          name?: string
          owner_id?: string
          public_slug?: string | null
          ssl_days_remaining?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      alert_kind: "email" | "discord" | "telegram" | "webhook"
      app_role: "admin" | "user"
      server_status: "up" | "degraded" | "down" | "unknown"
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
      alert_kind: ["email", "discord", "telegram", "webhook"],
      app_role: ["admin", "user"],
      server_status: ["up", "degraded", "down", "unknown"],
    },
  },
} as const
