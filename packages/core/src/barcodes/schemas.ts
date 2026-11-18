import { z } from "zod"

export const barcodeMemorySchema = z.object({
  code: z.string().regex(/^\d{8,14}$/),
  name: z.string().trim().min(1).max(80),
  quantity: z.number().positive().max(1_000_000).nullable(),
  unit: z.string().trim().min(1).max(24),
})

export const barcodeMemoriesSchema = z.array(barcodeMemorySchema).max(100)
