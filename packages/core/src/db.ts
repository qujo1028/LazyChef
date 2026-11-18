// Row and enum types from the generated database types, the same helpers as src/types/database.ts.
import type { Database, Json } from "@lazychef/db-types"

type PublicSchema = Database["public"]

export type { Json }

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"]

export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T]
