// "Ask AI for an idea": the prompt, the reply's shape and the clean-up live in packages/core
// (shared with the `ai` Edge Function). Re-exported here so the web's imports stay put.
export * from "@lazychef/core/recipes/ai/idea"
