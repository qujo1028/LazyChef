import "server-only"

import { isExpoPushToken } from "@lazychef/core/push/app-contract"

import { normalizePem } from "./jwt"
import { createApnsSender, type ApnsConfig } from "./apns"
import { createExpoSender } from "./expo"
import { createFcmSender, parseServiceAccount } from "./fcm"
import { failure, type PushSender } from "./types"

const NOT_CONFIGURED = (platform: string) => failure(`${platform} push isn't configured`)

function apnsConfigFromEnv(): ApnsConfig | null {
  const { APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY, APNS_BUNDLE_ID, APNS_ENVIRONMENT } = process.env
  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_PRIVATE_KEY?.trim() || !APNS_BUNDLE_ID) return null
  return {
    keyId: APNS_KEY_ID.trim(),
    teamId: APNS_TEAM_ID.trim(),
    privateKey: normalizePem(APNS_PRIVATE_KEY),
    bundleId: APNS_BUNDLE_ID.trim(),
    environment: APNS_ENVIRONMENT === "sandbox" ? "sandbox" : "production",
  }
}

let cached: PushSender | undefined

/**
 * The real sender: Expo's push service for tokens the Expo app registered, APNs for other iPhone
 * tokens, FCM for other Android ones. Expo needs no keys (EXPO_ACCESS_TOKEN only if the project
 * requires it). A platform without credentials gets a sender that reports "not configured" instead
 * of crashing, so local dev and preview deploys work without any keys.
 */
export function getSender(): PushSender {
  if (cached) return cached
  const apnsConfig = apnsConfigFromEnv()
  const account = parseServiceAccount(process.env.FCM_SERVICE_ACCOUNT_JSON)
  const apns = apnsConfig ? createApnsSender(apnsConfig) : null
  const fcm = account ? createFcmSender(account) : null
  const expo = createExpoSender(process.env.EXPO_ACCESS_TOKEN?.trim() || undefined)
  cached = {
    async send(token, platform, message) {
      if (isExpoPushToken(token)) return expo.send(token.trim(), platform, message)
      const sender = platform === "ios" ? apns : fcm
      if (!sender) {
        console.info(`[push] ${platform} credentials missing; skipped a ${message.kind} push`)
        return NOT_CONFIGURED(platform)
      }
      return sender.send(token, platform, message)
    },
  }
  return cached
}
