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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_pantry_items: {
        Args: { p_household_id: string; p_items: Json }
        Returns: string[]
      }
      adjust_pantry_quantity: {
        Args: { p_delta: number; p_item_id: string }
        Returns: number
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
      activity_action: "added" | "used" | "restocked" | "updated" | "removed"
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
