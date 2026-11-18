import { generateKeyPairSync, verify } from "node:crypto"
import { describe, expect, it } from "vitest"

import { classifyApns, classifyFcm } from "./classify"
import { normalizePem, signJwt } from "./jwt"

describe("classifyApns", () => {
  it("200 is sent", () => expect(classifyApns(200, undefined)).toEqual({ ok: true }))
  it("410 and BadDeviceToken mean the token is dead", () => {
    expect(classifyApns(410, "Unregistered")).toMatchObject({ ok: false, invalidToken: true, retryable: false })
    expect(classifyApns(400, "BadDeviceToken")).toMatchObject({ ok: false, invalidToken: true })
  })
  it("other 400s are not the token's fault", () => {
    expect(classifyApns(400, "PayloadEmpty")).toMatchObject({ invalidToken: false, retryable: false })
  })
  it("429, 5xx and an expired provider token are worth retrying", () => {
    expect(classifyApns(429, "TooManyRequests")).toMatchObject({ retryable: true })
    expect(classifyApns(503, "ServiceUnavailable")).toMatchObject({ retryable: true })
    expect(classifyApns(403, "ExpiredProviderToken")).toMatchObject({ retryable: true, invalidToken: false })
  })
})

describe("classifyFcm", () => {
  it("2xx is sent", () => expect(classifyFcm(200, null)).toEqual({ ok: true }))
  it("UNREGISTERED and NOT_FOUND mean the token is dead", () => {
    expect(classifyFcm(404, { error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } })).toMatchObject({ invalidToken: true })
    expect(classifyFcm(400, { error: { details: [{ errorCode: "UNREGISTERED" }] } })).toMatchObject({ invalidToken: true })
    expect(classifyFcm(404, null)).toMatchObject({ invalidToken: true })
  })
  it("quota and server errors are retryable, bad requests are not", () => {
    expect(classifyFcm(429, { error: { status: "RESOURCE_EXHAUSTED" } })).toMatchObject({ retryable: true })
    expect(classifyFcm(500, null)).toMatchObject({ retryable: true })
    expect(classifyFcm(400, { error: { status: "INVALID_ARGUMENT" } })).toMatchObject({ retryable: false, invalidToken: false })
  })
  it("reasons never include the response body", () => {
    expect(JSON.stringify(classifyFcm(400, { error: { message: "token abc123 is bad" } }))).not.toContain("abc123")
  })
})

describe("jwt", () => {
  it("signs ES256 with the raw signature JWTs need, verifiable with the public key", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" })
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }) as string
    const jwt = signJwt("ES256", { kid: "KEY1" }, { iss: "TEAM", iat: 1 }, pem)
    const [header, claims, signature] = jwt.split(".")
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "ES256", typ: "JWT", kid: "KEY1" })
    expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toEqual({ iss: "TEAM", iat: 1 })
    expect(Buffer.from(signature, "base64url")).toHaveLength(64)
    expect(
      verify("sha256", Buffer.from(`${header}.${claims}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url")),
    ).toBe(true)
  })

  it("signs RS256", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }) as string
    const [header, claims, signature] = signJwt("RS256", {}, { iss: "x" }, pem).split(".")
    expect(verify("RSA-SHA256", Buffer.from(`${header}.${claims}`), publicKey, Buffer.from(signature, "base64url"))).toBe(true)
  })

  it("puts line breaks back in a key pasted with escaped newlines and quotes", () => {
    expect(normalizePem('"-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----"')).toBe(
      "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
    )
  })
})
