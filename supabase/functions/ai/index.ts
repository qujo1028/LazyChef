// The `ai` Edge Function: recipe ideas from the household's pantry for the mobile app, with the
// Groq key kept server-side. See README.md and handler.ts.
//
// Secrets: GROQ_API_KEY (set in the Supabase dashboard). SUPABASE_URL and SUPABASE_ANON_KEY are
// provided by Supabase. No service role key is used.
import { authenticate } from "./db.ts"
import { createGroq, type Llm } from "./groq.ts"
import { createHandler } from "./handler.ts"

const log = (message: string) => console.warn(message)

const url = Deno.env.get("SUPABASE_URL")?.trim() ?? ""
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim() ?? ""
const groqKey = Deno.env.get("GROQ_API_KEY")?.trim() ?? ""

// Per isolate: the Groq guards (30 a minute, the pause after a 429).
const llm: Llm | null = groqKey ? createGroq(groqKey) : null

if (!llm) log("[ai] GROQ_API_KEY isn't set: answering not_configured.")
if (!url || !anonKey) log("[ai] SUPABASE_URL or SUPABASE_ANON_KEY is missing.")

const handle = createHandler({
  llm,
  log,
  async authenticate(token) {
    if (!url || !anonKey) throw new Error("Supabase isn't configured")
    return await authenticate(url, anonKey, token)
  },
})

Deno.serve(handle)
