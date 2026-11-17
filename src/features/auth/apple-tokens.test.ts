import { generateKeyPairSync, verify } from "node:crypto"

import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
const getAdminClient = vi.fn()
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: () => getAdminClient() }))

import {
  buildAppleClientSecret,
  getAppleConfig,
  jwtSubject,
  revokeAppleTokens,
  storeAppleAuthorizationCode,
  storeAppleRefreshToken,
} from "./apple-tokens"

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" })
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString()
const config = { teamId: "TEAM123456", keyId: "KEY1234567", privateKey: pem, clientId: "app.lazychef" }

const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"))

describe("getAppleConfig", () => {
  const full = {
    APPLE_TEAM_ID: " TEAM123456 ",
    APPLE_KEY_ID: "KEY1234567",
    APPLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----",
    APPLE_CLIENT_ID: "app.lazychef",
  }

  it("needs all four settings", () => {
    for (const name of Object.keys(full)) {
      expect(getAppleConfig({ ...full, [name]: undefined })).toBeNull()
      expect(getAppleConfig({ ...full, [name]: "  " })).toBeNull()
    }
  })

  it("trims and restores escaped newlines in the key", () => {
    expect(getAppleConfig(full)).toEqual({
      teamId: "TEAM123456",
      keyId: "KEY1234567",
      privateKey: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
      clientId: "app.lazychef",
    })
  })
})

describe("buildAppleClientSecret", () => {
  const now = new Date("2026-11-10T12:00:00Z")
  const iat = Math.floor(now.getTime() / 1000)

  it("is an ES256 JWT with the claims Apple expects", () => {
    const [header, claims] = buildAppleClientSecret(config, now).split(".")
    expect(decode(header)).toEqual({ alg: "ES256", kid: "KEY1234567" })
    const payload = decode(claims)
    expect(payload).toEqual({
      iss: "TEAM123456",
      sub: "app.lazychef",
      aud: "https://appleid.apple.com",
      iat,
      exp: payload.exp,
    })
    expect(payload.exp).toBeGreaterThan(iat)
    expect(payload.exp - iat).toBeLessThanOrEqual(15777000) // Apple's 6-month limit
  })

  it("is signed with the key (raw r||s signature)", () => {
    const [header, claims, signature] = buildAppleClientSecret(config, now).split(".")
    const raw = Buffer.from(signature, "base64url")
    expect(raw).toHaveLength(64)
    expect(
      verify("sha256", Buffer.from(`${header}.${claims}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, raw),
    ).toBe(true)
  })

  it("accepts the key without its PEM header lines", () => {
    const bare = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")
    const [header, claims, signature] = buildAppleClientSecret({ ...config, privateKey: bare }, now).split(".")
    expect(
      verify(
        "sha256",
        Buffer.from(`${header}.${claims}`),
        { key: publicKey, dsaEncoding: "ieee-p1363" },
        Buffer.from(signature, "base64url"),
      ),
    ).toBe(true)
  })
})

describe("jwtSubject", () => {
  it("reads sub, and copes with junk", () => {
    const token = `x.${Buffer.from(JSON.stringify({ sub: "001234.abc" })).toString("base64url")}.y`
    expect(jwtSubject(token)).toBe("001234.abc")
    expect(jwtSubject("not a jwt")).toBeNull()
    expect(jwtSubject(undefined)).toBeNull()
  })
})

describe("when Apple isn't configured", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    getAdminClient.mockReset()
  })

  it("does nothing at all", async () => {
    for (const name of ["APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY", "APPLE_CLIENT_ID"]) vi.stubEnv(name, "")
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)

    await expect(storeAppleAuthorizationCode("user-1", "code")).resolves.toBeUndefined()
    await expect(storeAppleRefreshToken("user-1", "token")).resolves.toBeUndefined()
    expect(getAdminClient).not.toHaveBeenCalled()
    await expect(revokeAppleTokens("user-1")).resolves.toEqual({ usedApple: false, revoked: false })
    expect(fetch).not.toHaveBeenCalled()
  })

  it("still reports an Apple user, so they can be told to remove LazyChef from their Apple ID", async () => {
    for (const name of ["APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY", "APPLE_CLIENT_ID"]) vi.stubEnv(name, "")
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)
    getAdminClient.mockReturnValue(adminWith({ identities: [{ provider: "apple" }], token: null }))
    await expect(revokeAppleTokens("user-1")).resolves.toEqual({ usedApple: true, revoked: false })
    expect(fetch).not.toHaveBeenCalled()
  })
})

/** A stand-in admin client: one user with `identities`, and an optional stored refresh token. */
function adminWith({ identities, token }: { identities: { provider: string }[]; token: string | null }) {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: token ? { refresh_token: token } : null, error: null }),
  }
  return {
    auth: { admin: { getUserById: async () => ({ data: { user: { identities } }, error: null }) } },
    from: () => query,
  }
}

describe("revokeAppleTokens when configured", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    getAdminClient.mockReset()
  })

  function configure() {
    vi.stubEnv("APPLE_TEAM_ID", config.teamId)
    vi.stubEnv("APPLE_KEY_ID", config.keyId)
    vi.stubEnv("APPLE_PRIVATE_KEY", pem)
    vi.stubEnv("APPLE_CLIENT_ID", config.clientId)
    vi.stubEnv("APPLE_SERVICES_ID", "app.lazychef.web")
  }

  it("tries the Services ID when the bundle ID didn't issue the token", async () => {
    configure()
    getAdminClient.mockReturnValue(adminWith({ identities: [{ provider: "apple" }], token: "rt" }))
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "invalid_client" }), { status: 400 }))
      .mockResolvedValueOnce(new Response("", { status: 200 }))
    vi.stubGlobal("fetch", fetch)

    await expect(revokeAppleTokens("user-1")).resolves.toEqual({ usedApple: true, revoked: true })
    const clients = fetch.mock.calls.map(([, init]) => new URLSearchParams(init.body).get("client_id"))
    expect(clients).toEqual(["app.lazychef", "app.lazychef.web"])
  })

  it("skips people who never used Apple", async () => {
    configure()
    getAdminClient.mockReturnValue(adminWith({ identities: [{ provider: "google" }], token: null }))
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)
    await expect(revokeAppleTokens("user-1")).resolves.toEqual({ usedApple: false, revoked: false })
    expect(fetch).not.toHaveBeenCalled()
  })
})
