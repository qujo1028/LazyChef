import "server-only"

import { askAiJson, type AiResult } from "@/lib/llm/ai"
import type { OffProduct } from "@/lib/barcode/product"

import { catalogCandidates, tidyMessages, tidyProduct, tidyReplySchema, toSuggestion, type TidySuggestion } from "./prompt"

const NO_NAME = "This product has no name to tidy. Type one instead."
const UNUSABLE = "The AI assistant couldn't tidy that name. Edit it yourself instead."

/** Asks the model for a cleaner name for an Open Food Facts product. Callers check auth first. */
export async function tidyScannedProduct(product: OffProduct): Promise<AiResult<TidySuggestion>> {
  const input = tidyProduct(product)
  if (!input) return { ok: false, error: NO_NAME }
  const candidates = catalogCandidates(input)
  const reply = await askAiJson(tidyMessages(input, candidates), tidyReplySchema, { maxTokens: 300, temperature: 0.2 })
  if (!reply.ok) return reply
  const suggestion = toSuggestion(reply.data, input, candidates)
  return suggestion ? { ok: true, data: suggestion } : { ok: false, error: UNUSABLE }
}
