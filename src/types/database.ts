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
      saved_recipes: {
        Row: {
          created_at: string
          household_id: string
          recipe_id: number
          saved_by: string | null
          title: string
        }
        Insert: {
          created_at?: string
          household_id: string
          recipe_id: number
          saved_by?: string | null
          title: string
        }
        Update: {
          created_at?: string
          household_id?: string
          recipe_id?: number
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
            foreignKeyName: "spoonacular_cache_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      spoonacular_usage: {
        Row: {
          day: string
          points_left: number | null
          points_used: number
          requests: number
          updated_at: string
        }
        Insert: {
          day: string
          points_left?: number | null
          points_used?: number
          requests?: number
          updated_at?: string
        }
        Update: {
          day?: string
          points_left?: number | null
          points_used?: number
          requests?: number
          updated_at?: string
        }
        Relationships: []
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
      complete_shopping_trip: {
        Args: { p_household_id: string; p_list_item_ids: string[]; p_pantry_items: Json }
        Returns: string[]
      }
      cook_recipe: {
        Args: { p_deductions: Json; p_household_id: string; p_recipe_id: number; p_recipe_title: string }
        Returns: {
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
      join_household: {
        Args: { p_code: string }
        Returns: string
      }
      leave_household: {
        Args: { p_household_id: string }
        Returns: undefined
      }
      put_spoonacular_cache: {
        Args: { p_cache_key: string; p_household_id: string; p_response: Json; p_ttl_seconds?: number }
        Returns: string
      }
      record_spoonacular_usage: {
        Args: { p_points_left: number | null; p_points_used: number }
        Returns: undefined
      }
      regenerate_invite_code: {
        Args: { p_household_id: string }
        Returns: string
      }
      remove_member: {
        Args: { p_household_id: string; p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      activity_action: "added" | "used" | "restocked" | "updated" | "removed" | "cooked" | "shopped"
      household_role: "owner" | "member"
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
