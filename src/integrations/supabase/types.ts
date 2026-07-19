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
      companies: {
        Row: {
          id: string
          name: string
          slug: string
          industry: string | null
          website: string | null
          phone: string | null
          address: string | null
          logo_url: string | null
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          industry?: string | null
          website?: string | null
          phone?: string | null
          address?: string | null
          logo_url?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          industry?: string | null
          website?: string | null
          phone?: string | null
          address?: string | null
          logo_url?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          company_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          company_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          company_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_products: {
        Row: {
          created_at: string
          id: string
          name: string
          company_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          company_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          company_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      client_interactions: {
        Row: {
          client_id: string
          created_at: string
          id: string
          note: string | null
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          note?: string | null
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_interactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_access_requests: {
        Row: {
          id: string
          client_id: string
          requester_id: string
          owner_id: string
          message: string | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id: string
          requester_id: string
          owner_id: string
          message?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          company_id: string
          type: string
          title: string
          body: string
          client_id: string | null
          payload: Record<string, unknown>
          read: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          company_id: string
          type: string
          title: string
          body: string
          client_id?: string | null
          payload?: Record<string, unknown>
          read?: boolean
          created_at?: string
        }
        Update: {
          read?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_up_logs: {
        Row: {
          activity_type: string | null
          id: string
          follow_up_id: string
          client_id: string
          user_id: string
          note: string | null
          logged_at: string
        }
        Insert: {
          activity_type?: string | null
          id?: string
          follow_up_id: string
          client_id: string
          user_id: string
          note?: string | null
          logged_at?: string
        }
        Update: {
          activity_type?: string | null
          id?: string
          follow_up_id?: string
          client_id?: string
          user_id?: string
          note?: string | null
          logged_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_up_logs_follow_up_id_fkey"
            columns: ["follow_up_id"]
            isOneToOne: false
            referencedRelation: "client_follow_ups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_follow_ups: {
        Row: {
          client_id: string
          created_at: string
          custom_interval_days: number | null
          frequency: string
          id: string
          next_reminder: string
          note: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          custom_interval_days?: number | null
          frequency: string
          id?: string
          next_reminder: string
          note?: string | null
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          custom_interval_days?: number | null
          frequency?: string
          id?: string
          next_reminder?: string
          note?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_follow_ups_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_stage_events: {
        Row: {
          activity_type: string | null
          client_id: string
          created_at: string
          description: string
          event_type: Database["public"]["Enums"]["stage_event_type"]
          from_stage: number | null
          id: string
          lost_reason: string | null
          stage_value: number | null
          to_stage: number | null
          user_id: string
        }
        Insert: {
          activity_type?: string | null
          client_id: string
          created_at?: string
          description: string
          event_type: Database["public"]["Enums"]["stage_event_type"]
          from_stage?: number | null
          id?: string
          lost_reason?: string | null
          stage_value?: number | null
          to_stage?: number | null
          user_id: string
        }
        Update: {
          activity_type?: string | null
          client_id?: string
          created_at?: string
          description?: string
          event_type?: Database["public"]["Enums"]["stage_event_type"]
          from_stage?: number | null
          id?: string
          lost_reason?: string | null
          stage_value?: number | null
          to_stage?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_stage_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          category: string
          company_id: string
          contact_person: string | null
          contact_person_email: string | null
          contact_person_phone: string | null
          contact_person_role: string | null
          created_at: string
          created_by: string
          current_stage: number
          custom_fields: Json
          interest_scale: number
          email: string | null
          id: string
          location: string | null
          lost_reason: string | null
          mode_of_connection: string
          name: string
          product: string | null
          stage_label: string | null
          stage_notes: string | null
          stage_value: number
          status: Database["public"]["Enums"]["client_status"]
          updated_at: string
        }
        Insert: {
          category: string
          company_id: string
          contact_person?: string | null
          contact_person_email?: string | null
          contact_person_phone?: string | null
          contact_person_role?: string | null
          created_at?: string
          created_by: string
          current_stage?: number
          custom_fields?: Json
          interest_scale?: number
          email?: string | null
          id?: string
          location?: string | null
          lost_reason?: string | null
          mode_of_connection: string
          name: string
          product?: string | null
          stage_label?: string | null
          stage_notes?: string | null
          stage_value?: number
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
        }
        Update: {
          category?: string
          company_id?: string
          contact_person?: string | null
          contact_person_email?: string | null
          contact_person_phone?: string | null
          contact_person_role?: string | null
          created_at?: string
          created_by?: string
          current_stage?: number
          custom_fields?: Json
          interest_scale?: number
          email?: string | null
          id?: string
          location?: string | null
          lost_reason?: string | null
          mode_of_connection?: string
          name?: string
          product?: string | null
          stage_label?: string | null
          stage_notes?: string | null
          stage_value?: number
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      conversion_stage_config: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          id: string
          label: string
          stage_number: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          label: string
          stage_number: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          label?: string
          stage_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversion_stage_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          department: string | null
          email: string
          id: string
          must_change_password: boolean
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          department?: string | null
          email: string
          id: string
          must_change_password?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          department?: string | null
          email?: string
          id?: string
          must_change_password?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
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
      my_company_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      is_company_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_super_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user" | "super_admin"
      client_status: "active" | "won" | "lost"
      stage_event_type: "progress" | "regress" | "note" | "won" | "lost"
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
      app_role: ["admin", "user", "super_admin"],
      client_status: ["active", "won", "lost"],
      stage_event_type: ["progress", "regress", "note", "won", "lost"],
    },
  },
} as const
