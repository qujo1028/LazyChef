import { createPrivateKey, sign } from "node:crypto"

const b64url = (value: Buffer | string) => Buffer.from(value).toString("base64url")

/**
 * Pastes of a private key into an env var often arrive with literal "\n" instead of line breaks
 * (and sometimes wrapped in quotes). Put the real line breaks back.
 */
export function normalizePem(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "").replace(/\\n/g, "\n")
}

/** A signed JWT. ES256 (Apple) uses the raw r||s signature JWT requires, RS256 (Google) the usual one. */
export function signJwt(
  alg: "ES256" | "RS256",
  header: Record<string, string>,
  claims: Record<string, string | number>,
  privateKeyPem: string,
): string {
  const input = `${b64url(JSON.stringify({ alg, typ: "JWT", ...header }))}.${b64url(JSON.stringify(claims))}`
  const key = createPrivateKey(normalizePem(privateKeyPem))
  const signature =
    alg === "ES256"
      ? sign("sha256", Buffer.from(input), { key, dsaEncoding: "ieee-p1363" })
      : sign("RSA-SHA256", Buffer.from(input), key)
  return `${input}.${b64url(signature)}`
}
