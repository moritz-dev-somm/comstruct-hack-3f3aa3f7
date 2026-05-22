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
      agent_settings: {
        Row: {
          created_at: string
          id: string
          inbox_address: string | null
          inbox_id: string | null
          updated_at: string
          webhook_id: string | null
          webhook_secret: string | null
          webhook_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          inbox_address?: string | null
          inbox_id?: string | null
          updated_at?: string
          webhook_id?: string | null
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          inbox_address?: string | null
          inbox_id?: string | null
          updated_at?: string
          webhook_id?: string | null
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      negotiations: {
        Row: {
          clarification_count: number
          classification: Json | null
          confirmed_at: string | null
          created_at: string
          delivery_date_confidence: string | null
          delivery_date_iso: string | null
          delivery_date_iso_end: string | null
          delivery_date_needs_clarification: boolean
          delivery_date_raw: string | null
          failover_attempt: number
          failover_of: string | null
          followup_count: number
          id: string
          inbox_id: string
          last_inbound_from: string | null
          last_processed_message_id: string | null
          last_progress_at: string | null
          last_reply_at: string | null
          message_id: string | null
          needs_user_reason: string | null
          order_id: string
          order_snapshot: Json
          project: string | null
          reject_reason: string | null
          reply_excerpt: string | null
          reply_message_id: string | null
          security_reject_reason: string | null
          sent_at: string
          status: string
          subject: string | null
          supplier_email: string
          supplier_language: string | null
          supplier_name: string
          thread_id: string | null
          thread_messages: Json
          updated_at: string
        }
        Insert: {
          clarification_count?: number
          classification?: Json | null
          confirmed_at?: string | null
          created_at?: string
          delivery_date_confidence?: string | null
          delivery_date_iso?: string | null
          delivery_date_iso_end?: string | null
          delivery_date_needs_clarification?: boolean
          delivery_date_raw?: string | null
          failover_attempt?: number
          failover_of?: string | null
          followup_count?: number
          id?: string
          inbox_id: string
          last_inbound_from?: string | null
          last_processed_message_id?: string | null
          last_progress_at?: string | null
          last_reply_at?: string | null
          message_id?: string | null
          needs_user_reason?: string | null
          order_id: string
          order_snapshot: Json
          project?: string | null
          reject_reason?: string | null
          reply_excerpt?: string | null
          reply_message_id?: string | null
          security_reject_reason?: string | null
          sent_at?: string
          status?: string
          subject?: string | null
          supplier_email: string
          supplier_language?: string | null
          supplier_name: string
          thread_id?: string | null
          thread_messages?: Json
          updated_at?: string
        }
        Update: {
          clarification_count?: number
          classification?: Json | null
          confirmed_at?: string | null
          created_at?: string
          delivery_date_confidence?: string | null
          delivery_date_iso?: string | null
          delivery_date_iso_end?: string | null
          delivery_date_needs_clarification?: boolean
          delivery_date_raw?: string | null
          failover_attempt?: number
          failover_of?: string | null
          followup_count?: number
          id?: string
          inbox_id?: string
          last_inbound_from?: string | null
          last_processed_message_id?: string | null
          last_progress_at?: string | null
          last_reply_at?: string | null
          message_id?: string | null
          needs_user_reason?: string | null
          order_id?: string
          order_snapshot?: Json
          project?: string | null
          reject_reason?: string | null
          reply_excerpt?: string | null
          reply_message_id?: string | null
          security_reject_reason?: string | null
          sent_at?: string
          status?: string
          subject?: string | null
          supplier_email?: string
          supplier_language?: string | null
          supplier_name?: string
          thread_id?: string | null
          thread_messages?: Json
          updated_at?: string
        }
        Relationships: []
      }
      product_imports: {
        Row: {
          created_at: string
          error: string | null
          filename: string
          id: string
          mime_type: string | null
          row_count: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          filename: string
          id?: string
          mime_type?: string | null
          row_count?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          filename?: string
          id?: string
          mime_type?: string | null
          row_count?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          attributes: Json
          category: string
          consumable: string | null
          created_at: string
          description: string | null
          description_en: string | null
          embedding: string | null
          enriched_at: string | null
          hazardous: boolean
          id: string
          image_url: string | null
          import_batch_id: string | null
          import_source_filename: string | null
          keywords: string[]
          keywords_en: string[]
          name: string
          name_en: string | null
          price_eur: number
          search_document: string | null
          sku: string
          source_category: string | null
          storage_location: string | null
          supplier: string | null
          typical_site: string | null
          unit: string
          unit_en: string | null
          updated_at: string
          use_cases: Json
          use_cases_en: Json
        }
        Insert: {
          attributes?: Json
          category: string
          consumable?: string | null
          created_at?: string
          description?: string | null
          description_en?: string | null
          embedding?: string | null
          enriched_at?: string | null
          hazardous?: boolean
          id?: string
          image_url?: string | null
          import_batch_id?: string | null
          import_source_filename?: string | null
          keywords?: string[]
          keywords_en?: string[]
          name: string
          name_en?: string | null
          price_eur?: number
          search_document?: string | null
          sku: string
          source_category?: string | null
          storage_location?: string | null
          supplier?: string | null
          typical_site?: string | null
          unit?: string
          unit_en?: string | null
          updated_at?: string
          use_cases?: Json
          use_cases_en?: Json
        }
        Update: {
          attributes?: Json
          category?: string
          consumable?: string | null
          created_at?: string
          description?: string | null
          description_en?: string | null
          embedding?: string | null
          enriched_at?: string | null
          hazardous?: boolean
          id?: string
          image_url?: string | null
          import_batch_id?: string | null
          import_source_filename?: string | null
          keywords?: string[]
          keywords_en?: string[]
          name?: string
          name_en?: string | null
          price_eur?: number
          search_document?: string | null
          sku?: string
          source_category?: string | null
          storage_location?: string | null
          supplier?: string | null
          typical_site?: string | null
          unit?: string
          unit_en?: string | null
          updated_at?: string
          use_cases?: Json
          use_cases_en?: Json
        }
        Relationships: []
      }
      rfq_quotes: {
        Row: {
          created_at: string
          id: string
          lead_time_days: number | null
          line_total_eur: number | null
          negotiation_id: string | null
          raw_reply_excerpt: string | null
          received_at: string | null
          reject_reason: string | null
          rfq_id: string
          shipping_cost_eur: number | null
          status: string
          supplier_email: string | null
          supplier_name: string
          total_eur: number | null
          unit_price_eur: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_time_days?: number | null
          line_total_eur?: number | null
          negotiation_id?: string | null
          raw_reply_excerpt?: string | null
          received_at?: string | null
          reject_reason?: string | null
          rfq_id: string
          shipping_cost_eur?: number | null
          status?: string
          supplier_email?: string | null
          supplier_name: string
          total_eur?: number | null
          unit_price_eur?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_time_days?: number | null
          line_total_eur?: number | null
          negotiation_id?: string | null
          raw_reply_excerpt?: string | null
          received_at?: string | null
          reject_reason?: string | null
          rfq_id?: string
          shipping_cost_eur?: number | null
          status?: string
          supplier_email?: string | null
          supplier_name?: string
          total_eur?: number | null
          unit_price_eur?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfq_quotes_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
        ]
      }
      rfqs: {
        Row: {
          cancellation_reason: string | null
          created_at: string
          deadline_at: string
          decided_at: string | null
          dominant_category: string | null
          escalation_reason: string | null
          failover_history: Json
          id: string
          invited_suppliers: string[]
          order_id: string
          order_snapshot: Json
          status: string
          updated_at: string
          winner_supplier: string | null
          winner_total_eur: number | null
        }
        Insert: {
          cancellation_reason?: string | null
          created_at?: string
          deadline_at: string
          decided_at?: string | null
          dominant_category?: string | null
          escalation_reason?: string | null
          failover_history?: Json
          id?: string
          invited_suppliers?: string[]
          order_id: string
          order_snapshot?: Json
          status?: string
          updated_at?: string
          winner_supplier?: string | null
          winner_total_eur?: number | null
        }
        Update: {
          cancellation_reason?: string | null
          created_at?: string
          deadline_at?: string
          decided_at?: string | null
          dominant_category?: string | null
          escalation_reason?: string | null
          failover_history?: Json
          id?: string
          invited_suppliers?: string[]
          order_id?: string
          order_snapshot?: Json
          status?: string
          updated_at?: string
          winner_supplier?: string | null
          winner_total_eur?: number | null
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          created_at: string
          email: string
          id: string
          language: string
          name: string
          phone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          language?: string
          name: string
          phone: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          language?: string
          name?: string
          phone?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      hybrid_search_materials: {
        Args: {
          category_filter?: string
          keyword_filters?: string[]
          match_count?: number
          user_embedding: string
        }
        Returns: {
          category: string
          description: string
          hybrid_score: number
          keyword_score: number
          keywords: string[]
          name: string
          price_eur: number
          similarity: number
          sku: string
          supplier: string
          unit: string
        }[]
      }
      hybrid_search_materials_cheap_first: {
        Args: {
          category_filter?: string
          keyword_filters?: string[]
          match_count?: number
          user_embedding: string
        }
        Returns: {
          category: string
          description: string
          hybrid_score: number
          keyword_score: number
          keywords: string[]
          name: string
          price_eur: number
          similarity: number
          sku: string
          supplier: string
          unit: string
        }[]
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
