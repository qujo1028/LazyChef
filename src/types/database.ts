// Mirrors supabase/migrations. Regenerate from the live schema with
//   npx supabase gen types typescript --project-id gldppemwlecnbarxamcb > src/types/database.ts
// (or the Supabase MCP's generate_typescript_types) after each migration.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: Database["public"]["Enums"]["activity_action"]
          actor_id: string | null
          batch_id: number
          created_at: string
          details: Json
          household_id: string
          id: number
          item_name: string
          quantity: number | null
          unit: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["activity_action"]
          actor_id?: string | null
          batch_id: number
          created_at?: string
          details?: Json
          household_id: string
          id?: never
          item_name: string
          quantity?: number | null
          unit?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["activity_action"]
          actor_id?: string | null
          batch_id?: number
          created_at?: string
          details?: Json
          household_id?: string
          id?: never
          item_name?: string
          quantity?: number | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_idea_cache: {
        Row: {
          cache_key: string
          created_at: string
          expires_at: string
          household_id: string
          response: Json
        }
        Insert: {
          cache_key: string
          created_at?: string
          expires_at: string
          household_id: string
          response: Json
        }
        Update: {
          cache_key?: string
          created_at?: string
          expires_at?: string
          household_id?: string
          response?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_idea_cache_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage: {
        Row: {
          household_id: string
          id: number
          used_at: string
          user_id: string | null
        }
        Insert: {
          household_id: string
          id?: never
          used_at?: string
          user_id?: string | null
        }
        Update: {
          household_id?: string
          id?: never
          used_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      apple_refresh_tokens: {
        Row: {
          created_at: string
          refresh_token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          refresh_token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          refresh_token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      category_overrides: {
        Row: {
          category: Database["public"]["Enums"]["item_category"]
          household_id: string
          ingredient_key: string
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["item_category"]
          household_id: string
          ingredient_key: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["item_category"]
          household_id?: string
          ingredient_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_overrides_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      device_tokens: {
        Row: {
          app_version: string | null
          created_at: string
          id: string
          last_seen_at: string
          platform: string
          timezone: string
          token: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string
          platform: string
          timezone?: string
          token: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string
          platform?: string
          timezone?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      household_barcodes: {
        Row: {
          code: string
          household_id: string
          name: string
          quantity: number | null
          saved_by: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          code: string
          household_id: string
          name: string
          quantity?: number | null
          saved_by?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          code?: string
          household_id?: string
          name?: string
          quantity?: number | null
          saved_by?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_barcodes_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_barcodes_saved_by_fkey"
            columns: ["saved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          household_id: string
          joined_at: string
          role: Database["public"]["Enums"]["household_role"]
          user_id: string
        }
        Insert: {
          household_id: string
          joined_at?: string
          role?: Database["public"]["Enums"]["household_role"]
          user_id: string
        }
        Update: {
          household_id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["household_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          invite_code: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          invite_code: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          invite_code?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "households_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_log: {
        Row: {
          dedupe_key: string
          id: number
          kind: string
          sent_at: string
          user_id: string
        }
        Insert: {
          dedupe_key: string
          id?: never
          kind: string
          sent_at?: string
          user_id: string
        }
        Update: {
          dedupe_key?: string
          id?: never
          kind?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_prefs: {
        Row: {
          expiring: boolean
          joined: boolean
          list: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          expiring?: boolean
          joined?: boolean
          list?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          expiring?: boolean
          joined?: boolean
          list?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pantry_items: {
        Row: {
          category: Database["public"]["Enums"]["item_category"]
          created_at: string
          created_by: string | null
          expires_on: string | null
          household_id: string
          id: string
          ingredient_id: number | null
          is_staple: boolean
          name: string
          quantity: number | null
          unit: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category?: Database["public"]["Enums"]["item_category"]
          created_at?: string
          created_by?: string | null
          expires_on?: string | null
          household_id: string
          id?: string
          ingredient_id?: number | null
          is_staple?: boolean
          name: string
          quantity?: number | null
          unit?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["item_category"]
          created_at?: string
          created_by?: string | null
          expires_on?: string | null
          household_id?: string
          id?: string
          ingredient_id?: number | null
          is_staple?: boolean
          name?: string
          quantity?: number | null
          unit?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pantry_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pantry_items_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pantry_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_household_id: string | null
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          active_household_id?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name: string
          id: string
        }
        Update: {
          active_household_id?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_household_id_fkey"
            columns: ["active_household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          household_id: string | null
          ingredient_id: number | null
          name: string
          name_key: string
          optional: boolean
          original: string
          position: number
          quantity: number | null
          recipe_id: string
          unit: string | null
        }
        Insert: {
          household_id?: string | null
          ingredient_id?: number | null
          name: string
          name_key: string
          optional?: boolean
          original: string
          position: number
          quantity?: number | null
          recipe_id: string
          unit?: string | null
        }
        Update: {
          household_id?: string | null
          ingredient_id?: number | null
          name?: string
          name_key?: string
          optional?: boolean
          original?: string
          position?: number
          quantity?: number | null
          recipe_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ratings: {
        Row: {
          created_at: string
          household_id: string
          rating: number
          recipe_ref: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          household_id: string
          rating: number
          recipe_ref: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          household_id?: string
          rating?: number
          recipe_ref?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ratings_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ratings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          ai_generated: boolean
          created_at: string
          created_by: string | null
          cuisine: string | null
          extended: boolean
          hidden: boolean
          household_id: string | null
          id: string
          image_ai_generated: boolean
          image_author: string | null
          image_license: string | null
          image_license_url: string | null
          image_source_url: string | null
          image_url: string | null
          instructions: string[]
          meal_types: string[]
          photo_path: string | null
          ready_in_minutes: number | null
          servings: number | null
          source: Database["public"]["Enums"]["recipe_source"]
          source_id: string | null
          source_url: string | null
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          ai_generated?: boolean
          created_at?: string
          created_by?: string | null
          cuisine?: string | null
          extended?: boolean
          hidden?: boolean
          household_id?: string | null
          id?: string
          image_ai_generated?: boolean
          image_author?: string | null
          image_license?: string | null
          image_license_url?: string | null
          image_source_url?: string | null
          image_url?: string | null
          instructions?: string[]
          meal_types?: string[]
          photo_path?: string | null
          ready_in_minutes?: number | null
          servings?: number | null
          source?: Database["public"]["Enums"]["recipe_source"]
          source_id?: string | null
          source_url?: string | null
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          ai_generated?: boolean
          created_at?: string
          created_by?: string | null
          cuisine?: string | null
          extended?: boolean
          hidden?: boolean
          household_id?: string | null
          id?: string
          image_ai_generated?: boolean
          image_author?: string | null
          image_license?: string | null
          image_license_url?: string | null
          image_source_url?: string | null
          image_url?: string | null
          instructions?: string[]
          meal_types?: string[]
          photo_path?: string | null
          ready_in_minutes?: number | null
          servings?: number | null
          source?: Database["public"]["Enums"]["recipe_source"]
          source_id?: string | null
          source_url?: string | null
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      revenuecat_events: {
        Row: {
          app_user_id: string | null
          environment: string | null
          event_at: string | null
          id: string
          payload: Json
          received_at: string
          type: string
        }
        Insert: {
          app_user_id?: string | null
          environment?: string | null
          event_at?: string | null
          id: string
          payload: Json
          received_at?: string
          type: string
        }
        Update: {
          app_user_id?: string | null
          environment?: string | null
          event_at?: string | null
          id?: string
          payload?: Json
          received_at?: string
          type?: string
        }
        Relationships: []
      }
      saved_recipes: {
        Row: {
          created_at: string
          household_id: string
          id: string
          image_url: string | null
          local_recipe_id: string | null
          recipe_id: number | null
          saved_by: string | null
          title: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          image_url?: string | null
          local_recipe_id?: string | null
          recipe_id?: number | null
          saved_by?: string | null
          title: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          image_url?: string | null
          local_recipe_id?: string | null
          recipe_id?: number | null
          saved_by?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_recipes_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_recipes_local_recipe_id_fkey"
            columns: ["local_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_recipes_saved_by_fkey"
            columns: ["saved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_list_items: {
        Row: {
          added_by: string | null
          category: Database["public"]["Enums"]["item_category"]
          checked_at: string | null
          checked_by: string | null
          created_at: string
          household_id: string
          id: string
          ingredient_id: number | null
          name: string
          note: string | null
          quantity: number | null
          recipe_id: number | null
          recipe_title: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          added_by?: string | null
          category?: Database["public"]["Enums"]["item_category"]
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          household_id: string
          id?: string
          ingredient_id?: number | null
          name: string
          note?: string | null
          quantity?: number | null
          recipe_id?: number | null
          recipe_title?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          added_by?: string | null
          category?: Database["public"]["Enums"]["item_category"]
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          household_id?: string
          id?: string
          ingredient_id?: number | null
          name?: string
          note?: string | null
          quantity?: number | null
          recipe_id?: number | null
          recipe_title?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_items_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      spoonacular_cache: {
        Row: {
          cache_key: string
          created_at: string
          expires_at: string
          response: Json
        }
        Insert: {
          cache_key: string
          created_at?: string
          expires_at?: string
          response: Json
        }
        Update: {
          cache_key?: string
          created_at?: string
          expires_at?: string
          response?: Json
        }
        Relationships: []
      }
      spoonacular_usage: {
        Row: {
          day: string
          exhausted_at: string | null
          points_left: number | null
          points_used: number
          requests: number
          updated_at: string
        }
        Insert: {
          day: string
          exhausted_at?: string | null
          points_left?: number | null
          points_used?: number
          requests?: number
          updated_at?: string
        }
        Update: {
          day?: string
          exhausted_at?: string | null
          points_left?: number | null
          points_used?: number
          requests?: number
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          billing_issue_at: string | null
          expires_at: string | null
          has_entitlement: boolean
          is_sandbox: boolean
          management_url: string | null
          period_type: string | null
          product_id: string | null
          store: string | null
          synced_at: string
          user_id: string
          will_renew: boolean
        }
        Insert: {
          billing_issue_at?: string | null
          expires_at?: string | null
          has_entitlement?: boolean
          is_sandbox?: boolean
          management_url?: string | null
          period_type?: string | null
          product_id?: string | null
          store?: string | null
          synced_at?: string
          user_id: string
          will_renew?: boolean
        }
        Update: {
          billing_issue_at?: string | null
          expires_at?: string | null
          has_entitlement?: boolean
          is_sandbox?: boolean
          management_url?: string | null
          period_type?: string | null
          product_id?: string | null
          store?: string | null
          synced_at?: string
          user_id?: string
          will_renew?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          allergies: string[]
          cuisines: string[]
          diet: string
          updated_at: string
          user_id: string
          weekly_goal: number
          world_recipes: boolean
        }
        Insert: {
          allergies?: string[]
          cuisines?: string[]
          diet?: string
          updated_at?: string
          user_id: string
          weekly_goal?: number
          world_recipes?: boolean
        }
        Update: {
          allergies?: string[]
          cuisines?: string[]
          diet?: string
          updated_at?: string
          user_id?: string
          weekly_goal?: number
          world_recipes?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_pantry_items: {
        Args: { p_household_id: string; p_items: Json }
        Returns: string[]
      }
      add_to_shopping_list: {
        Args: { p_household_id: string; p_items: Json }
        Returns: string[]
      }
      adjust_pantry_quantity: {
        Args: { p_delta: number; p_item_id: string }
        Returns: number
      }
      admin_activation_funnel: {
        Args: { p_since: string | null }
        Returns: { step: number; label: string; users: number }[]
      }
      admin_activity_daily: {
        Args: { p_days?: number }
        Returns: { day: string; action: string; n: number }[]
      }
      admin_ai_top_households: {
        Args: { p_limit?: number }
        Returns: { household_id: string; household_name: string; uses_7d: number; at_limit: boolean }[]
      }
      admin_ai_usage_stats: {
        Args: Record<PropertyKey, never>
        Returns: {
          uses_24h: number
          uses_7d: number
          households_active_7d: number
          households_at_limit: number
          free_weekly_limit: number
        }[]
      }
      admin_audit_recent: {
        Args: { p_limit?: number }
        Returns: {
          id: number
          at: string
          admin_user_id: string | null
          admin_email: string | null
          action: string
          target: string
          details: Json
        }[]
      }
      admin_capture_daily_snapshot: {
        Args: { p_day?: string }
        Returns: undefined
      }
      admin_daily_counters: {
        Args: { p_from: string; p_to: string }
        Returns: { day: string; metric: string; n: number }[]
      }
      admin_daily_snapshots: {
        Args: { p_from: string; p_to: string }
        Returns: {
          day: string
          captured_at: string
          users_total: number | null
          households_total: number | null
          multi_member_households: number | null
          pro_households: number | null
          paying_users: number | null
          trials_active: number | null
          comps_active: number | null
          mrr_est_usd: number | null
          pantry_items_total: number | null
          shopping_items_open: number | null
          saved_recipes_total: number | null
          spoonacular_points_used: number | null
        }[]
      }
      admin_find_user: {
        Args: { p_email: string }
        Returns: {
          user_id: string
          email: string
          display_name: string | null
          created_at: string | null
          last_sign_in_at: string | null
          pro_source: string | null
          comp_expires_at: string | null
          comp_note: string | null
          households: Json
        }[]
      }
      admin_grant_comp: {
        Args: { p_user_id: string; p_expires_at: string | null; p_note: string | null }
        Returns: undefined
      }
      admin_log_action: {
        Args: {
          p_admin_user_id: string | null
          p_admin_email: string | null
          p_action: string
          p_target: string
          p_details?: Json
        }
        Returns: number
      }
      admin_popular: {
        Args: { p_days?: number; p_limit?: number }
        Returns: { list: string; name: string; n: number }[]
      }
      admin_pro_stats: {
        Args: Record<PropertyKey, never>
        Returns: {
          active_subscriptions: number
          trials: number
          not_renewing: number
          sandbox: number
          comps_active: number
          pro_households: number
          by_store: Json
        }[]
      }
      admin_rate_limit_stats: {
        Args: Record<PropertyKey, never>
        Returns: {
          bucket: string
          max_hits: number
          window_length: string
          active_users: number
          users_at_limit: number
          hits_24h: number
        }[]
      }
      admin_retention_cohorts: {
        Args: { p_weeks?: number }
        Returns: { cohort_week: string; size: number; week_n: number; active: number }[]
      }
      admin_revenue_monthly: {
        Args: { p_months?: number }
        Returns: { month: string; gross: number; refunds: number }[]
      }
      admin_revenue_stats: {
        Args: Record<PropertyKey, never>
        Returns: {
          gross_all_time: number
          gross_30d: number
          gross_month: number
          refunds_30d: number
          net_30d_est: number
          mrr_est: number
          paying_users: number
          trials_started_30d: number
          expirations_30d: number
          sandbox_events_30d: number
        }[]
      }
      admin_revenuecat_recent: {
        Args: { p_limit?: number }
        Returns: {
          type: string
          product_id: string | null
          store: string | null
          environment: string | null
          event_at: string | null
          received_at: string
        }[]
      }
      admin_revoke_comp: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      admin_signups_daily: {
        Args: { p_days?: number }
        Returns: { day: string; users: number; households: number }[]
      }
      admin_usage_stats: {
        Args: Record<PropertyKey, never>
        Returns: { metric: string; all_time: number; d30: number | null; d7: number | null }[]
      }
      admin_user_stats: {
        Args: Record<PropertyKey, never>
        Returns: {
          users_total: number
          new_24h: number
          new_7d: number
          new_30d: number
          dau: number
          wau: number
          mau: number
          households_total: number
          households_new_7d: number
          households_new_30d: number
          avg_members: number
          multi_member_share: number
          empty_households: number
        }[]
      }
      bump_daily_metric: {
        Args: { p_metric: string }
        Returns: undefined
      }
      complete_shopping_trip: {
        Args: { p_household_id: string; p_list_item_ids: string[]; p_pantry_items: Json }
        Returns: string[]
      }
      cook_recipe: {
        Args: {
          p_deductions: Json
          p_household_id: string
          p_local_recipe_id?: string | null
          p_recipe_id: number | null
          p_recipe_title: string
        }
        Returns: {
          batch_id: number
          item_id: string
          name: string
          quantity_after: number | null
          quantity_before: number | null
          unit: string
        }[]
      }
      create_household: {
        Args: { p_name: string }
        Returns: string
      }
      get_invite_preview: {
        Args: { p_code: string }
        Returns: {
          household_id: string
          household_name: string
          is_member: boolean
          member_count: number
        }[]
      }
      get_pro_status: {
        Args: { p_household_id: string }
        Returns: {
          billing_issue_at: string | null
          expires_at: string | null
          household_pro: boolean
          management_url: string | null
          me_pro: boolean
          me_source: string | null
          period_type: string | null
          sponsor_name: string | null
          store: string | null
          will_renew: boolean | null
        }[]
      }
      get_trending_recipes: {
        Args: { p_limit?: number }
        Returns: {
          household_count: number
          id: string
          image_url: string | null
          ready_in_minutes: number | null
          title: string
        }[]
      }
      join_household: {
        Args: { p_code: string }
        Returns: string | null
      }
      leave_household: {
        Args: { p_household_id: string }
        Returns: undefined
      }
      match_local_recipes: {
        Args: {
          p_extended?: boolean
          p_household_id: string
          p_ignore_ids?: number[]
          p_ignore_keys?: string[]
          p_ingredient_ids: number[]
          p_limit?: number
          p_max_minutes?: number | null
          p_max_missing?: number
          p_meal_type?: string | null
          p_name_keys: string[]
          p_query?: string | null
        }
        Returns: {
          have_count: number
          missing_count: number
          recipe_id: string
        }[]
      }
      purge_spoonacular_cache: {
        Args: never
        Returns: number
      }
      put_ai_idea_cache: {
        Args: { p_cache_key: string; p_household_id: string; p_response: Json; p_ttl_seconds?: number }
        Returns: string
      }
      put_spoonacular_cache: {
        Args: { p_cache_key: string; p_response: Json; p_ttl_seconds?: number }
        Returns: string
      }
      rate_recipe: {
        Args: { p_household_id: string; p_rating: number; p_recipe_ref: string }
        Returns: number
      }
      record_spoonacular_usage: {
        Args: {
          p_estimated_cost?: number | null
          p_exhausted?: boolean
          p_points_left: number | null
          p_points_used: number | null
        }
        Returns: {
          exhausted: boolean
          points_left: number | null
          points_used: number
        }[]
      }
      regenerate_invite_code: {
        Args: { p_household_id: string }
        Returns: string
      }
      register_device_token: {
        Args: { p_app_version: string | null; p_platform: string; p_timezone: string; p_token: string }
        Returns: undefined
      }
      remove_member: {
        Args: { p_household_id: string; p_user_id: string }
        Returns: undefined
      }
      save_ai_recipe: {
        Args: { p_household_id: string; p_ingredients: Json; p_recipe: Json }
        Returns: string
      }
      save_household_recipe: {
        Args: { p_household_id: string; p_ingredients: Json; p_recipe: Json; p_recipe_id: string | null }
        Returns: string
      }
      set_my_notification_prefs: {
        Args: { p_expiring: boolean | null; p_joined: boolean | null; p_list: boolean | null }
        Returns: undefined
      }
      set_my_preferences: {
        Args: { p_allergies: string[]; p_cuisines: string[]; p_diet: string; p_world_recipes: boolean }
        Returns: undefined
      }
      set_my_weekly_goal: {
        Args: { p_goal: number }
        Returns: number
      }
      take_ai_allowance: {
        Args: { p_household_id: string }
        Returns: { allowed: boolean; pro: boolean; used: number; lim: number; resets_at: string | null }[]
      }
      take_rate_limit: {
        Args: { p_bucket: string }
        Returns: boolean
      }
      undo_cook: {
        Args: { p_amounts: Json; p_batch_id: number; p_household_id: string }
        Returns: undefined
      }
    }
    Enums: {
      activity_action: "added" | "used" | "restocked" | "updated" | "removed" | "cooked" | "shopped"
      household_role: "owner" | "member"
      recipe_source: "themealdb" | "user" | "lazychef"
      item_category:
        | "produce"
        | "bakery"
        | "meat"
        | "seafood"
        | "dairy"
        | "frozen"
        | "grains"
        | "baking"
        | "canned"
        | "condiments"
        | "spices"
        | "snacks"
        | "beverages"
        | "other"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database["public"]

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"]

export type Enums<T extends keyof PublicSchema["Enums"]> =
  PublicSchema["Enums"][T]
