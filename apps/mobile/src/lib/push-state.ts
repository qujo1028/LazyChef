// Pure push helpers for the app (no React Native imports, so Vitest can run them).
import { pushTapRoute, type PushKind, type PushTapRoute } from '@lazychef/core/push/app-contract';
import { deviceSchema, type DeviceRegistration } from '@lazychef/core/push/prefs';

export type PermissionState = 'granted' | 'undetermined' | 'denied';

/** Maps expo-notifications' permission response to the three states the UI cares about. */
export function permissionState(response: { granted: boolean; canAskAgain: boolean }): PermissionState {
  if (response.granted) return 'granted';
  return response.canAskAgain ? 'undetermined' : 'denied';
}

export type PushStatus =
  | 'unsupported' // simulator, Expo web: no push at all
  | 'no_project' // no EAS project ID yet (eas init pending)
  | 'denied' // the person said no in system settings
  | 'ready'; // can ask (or already allowed)

export function pushStatus(input: { capable: boolean; projectId: string | null; permission: PermissionState }): PushStatus {
  if (!input.capable) return 'unsupported';
  if (!input.projectId) return 'no_project';
  if (input.permission === 'denied') return 'denied';
  return 'ready';
}

/** A physical iPhone or Android phone. Simulators and the web can't get a push token. */
export function canUsePush(input: { os: string; isDevice: boolean }): boolean {
  return (input.os === 'ios' || input.os === 'android') && input.isDevice;
}

type ConstantsLike = {
  expoConfig?: { extra?: Record<string, unknown> | null } | null;
  easConfig?: { projectId?: string | null } | null;
};

/** The EAS project ID, from app.json extra.eas or the build's easConfig; null until `eas init` runs. */
export function resolveProjectId(constants: ConstantsLike): string | null {
  const eas = constants.expoConfig?.extra?.eas as { projectId?: unknown } | undefined;
  const fromConfig = typeof eas?.projectId === 'string' ? eas.projectId.trim() : '';
  if (fromConfig) return fromConfig;
  const fromEas = constants.easConfig?.projectId?.trim();
  return fromEas || null;
}

/** The register_device_token arguments, or null when the token or platform is unusable. */
export function registrationArgs(input: {
  token: string;
  os: string;
  timeZone: string;
  appVersion: string | null | undefined;
}): { p_token: string; p_platform: DeviceRegistration['platform']; p_timezone: string; p_app_version: string | null } | null {
  const parsed = deviceSchema.safeParse({
    token: input.token,
    platform: input.os,
    timezone: input.timeZone,
    appVersion: input.appVersion?.trim() || null,
  });
  if (!parsed.success) return null;
  const d = parsed.data;
  return { p_token: d.token, p_platform: d.platform, p_timezone: d.timezone, p_app_version: d.appVersion };
}

type ResponseLike = { notification: { request: { identifier: string } }; actionIdentifier: string };

/** One tap = one key (a notification can be reported by both the listener and the cold-start read). */
export function responseKey(response: ResponseLike): string {
  return `${response.notification.request.identifier}:${response.actionIdentifier}`;
}

/** Remembers which taps were handled. `first(response)` is true once per tap. */
export function createTapGuard(): { first: (response: ResponseLike) => boolean } {
  const seen = new Set<string>();
  return {
    first(response) {
      const key = responseKey(response);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    },
  };
}

/** Where a tap on this push goes (data.url from the server, checked against the allow list). */
export function tapRouteFor(data: unknown): PushTapRoute {
  const url = data && typeof data === 'object' ? (data as { url?: unknown }).url : undefined;
  return pushTapRoute(url);
}

/** The in-app toast text for a push that arrives while the app is open. */
export function toastMessage(content: { title?: string | null; body?: string | null }): string {
  const parts = [content.title?.trim(), content.body?.trim()].filter((p): p is string => Boolean(p));
  return parts.join(': ') || 'New activity in your household';
}

/** Dev only: a local notification for each kind, shaped like the server's pushes. */
export function devNotification(kind: PushKind): { title: string; body: string; data: { url: string; kind: PushKind } } {
  switch (kind) {
    case 'expiring':
      return { title: 'Food expiring soon', body: 'Milk and spinach are about to go bad.', data: { url: '/pantry', kind } };
    case 'list':
      return { title: 'Shopping list', body: 'Sam added eggs to the list.', data: { url: '/list', kind } };
    case 'joined':
      return { title: 'New housemate', body: 'Alex joined your household.', data: { url: '/household', kind } };
  }
}
