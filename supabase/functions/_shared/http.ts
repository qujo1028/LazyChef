// Request and response helpers the Edge Functions share (recipes, ai). Plain TypeScript, no
// Deno APIs, so Vitest can run them. Not a generated copy: this file is edited here.

/** Larger bodies are refused before parsing (60 names of 100 characters fit easily). */
export const MAX_BODY_BYTES = 16 * 1024

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
}

/** A JSON response with CORS and no caching. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  })
}

/** The bearer token from the Authorization header, or null. */
export function bearerToken(header: string | null): string | null {
  const match = header?.match(/^Bearer\s+(\S+)$/i)
  return match ? match[1] : null
}

/**
 * Reads the body as JSON, stopping as soon as it passes `maxBytes` (a chunked request has no
 * Content-Length, so the stream itself is capped). Undefined when it's too big or isn't JSON.
 */
export async function readJson(req: Request, maxBytes = MAX_BODY_BYTES): Promise<unknown> {
  const declared = Number(req.headers.get("Content-Length"))
  if (Number.isFinite(declared) && declared > maxBytes) return undefined
  if (!req.body) return undefined
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel().catch(() => {})
      return undefined
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return undefined
  }
}
