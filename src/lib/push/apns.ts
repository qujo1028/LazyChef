import "server-only"

import { connect, constants, type ClientHttp2Session } from "node:http2"

import { classifyApns } from "./classify"
import { signJwt } from "./jwt"
import { failure, type PushMessage, type PushSender, type SendResult } from "./types"

export type ApnsConfig = {
  keyId: string
  teamId: string
  /** The .p8 contents. */
  privateKey: string
  /** The iOS bundle id (app.lazychef). */
  bundleId: string
  environment: "production" | "sandbox"
}

// Apple wants a fresh provider token at least every hour and rejects ones older than that.
const TOKEN_TTL_MS = 50 * 60 * 1000
const TIMEOUT_MS = 10_000

/** Device tokens are hex. Anything else would be a malformed path, so it's treated as dead. */
const HEX = /^[0-9a-f]{16,200}$/i

export function createApnsSender(config: ApnsConfig, now: () => number = Date.now): PushSender {
  const origin = config.environment === "sandbox" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com"
  let session: ClientHttp2Session | null = null
  let jwt: { value: string; at: number } | null = null

  function providerToken() {
    if (!jwt || now() - jwt.at >= TOKEN_TTL_MS) {
      const issued = Math.floor(now() / 1000)
      jwt = { value: signJwt("ES256", { kid: config.keyId }, { iss: config.teamId, iat: issued }, config.privateKey), at: now() }
    }
    return jwt.value
  }

  function getSession() {
    if (session && !session.closed && !session.destroyed) return session
    const next = connect(origin)
    // A dropped connection just means the next send opens a new one.
    next.on("error", () => next.destroy())
    next.on("close", () => {
      if (session === next) session = null
    })
    next.unref()
    session = next
    return next
  }

  function post(token: string, body: string): Promise<{ status: number; reason?: string }> {
    return new Promise((resolve, reject) => {
      const request = getSession().request({
        [constants.HTTP2_HEADER_METHOD]: "POST",
        [constants.HTTP2_HEADER_PATH]: `/3/device/${token}`,
        authorization: `bearer ${providerToken()}`,
        "apns-topic": config.bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
      })
      request.setTimeout(TIMEOUT_MS, () => {
        request.close(constants.NGHTTP2_CANCEL)
        reject(new Error("timeout"))
      })
      let status = 0
      let text = ""
      request.on("response", (headers) => {
        status = Number(headers[constants.HTTP2_HEADER_STATUS])
      })
      request.setEncoding("utf8")
      request.on("data", (chunk: string) => {
        text += chunk
      })
      request.on("end", () => {
        let reason: string | undefined
        try {
          reason = (JSON.parse(text) as { reason?: string }).reason
        } catch {}
        resolve({ status, reason })
      })
      request.on("error", reject)
      request.end(body)
    })
  }

  return {
    async send(token: string, _platform, message: PushMessage): Promise<SendResult> {
      if (!HEX.test(token)) return failure("apns bad token format", { invalidToken: true })
      const payload = JSON.stringify({
        aps: { alert: { title: message.title, body: message.body }, sound: "default" },
        url: message.url,
        kind: message.kind,
      })
      try {
        const { status, reason } = await post(token, payload)
        // Our provider token was refused: drop it so the next send signs a new one.
        if (status === 403) jwt = null
        return classifyApns(status, reason)
      } catch (error) {
        return failure(`apns ${error instanceof Error ? error.message : "error"}`, { retryable: true })
      }
    },
  }
}
