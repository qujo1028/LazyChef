// Native side of push: permission, the Expo push token and registering it with the database.
// Pure decisions live in lib/push-state.ts. Nothing here runs on the web.
import { onlineManager } from '@tanstack/react-query';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { permissionState, pushStatus, registrationArgs, resolveProjectId, canUsePush, type PermissionState, type PushStatus } from '@/lib/push-state';
import { supabase } from '@/lib/supabase';
import { deviceTimeZone } from '@/lib/time-zone';

export type PushSetup = { status: PushStatus; permission: PermissionState };

const capable = () => canUsePush({ os: Platform.OS, isDevice: Device.isDevice });
const projectId = () => resolveProjectId(Constants);

async function readPermission(): Promise<PermissionState> {
  try {
    return permissionState(await Notifications.getPermissionsAsync());
  } catch {
    return 'undetermined';
  }
}

/** What this device can do right now. Never asks for anything. */
export async function readPushSetup(): Promise<PushSetup> {
  if (!capable()) return { status: 'unsupported', permission: 'undetermined' };
  const permission = await readPermission();
  return { status: pushStatus({ capable: true, projectId: projectId(), permission }), permission };
}

export type RegisterResult = 'ok' | PushStatus | 'offline' | 'failed';

async function registerToken(): Promise<'ok' | 'failed' | 'offline'> {
  if (!onlineManager.isOnline()) return 'offline';
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'LazyChef',
        importance: 3, // AndroidImportance.DEFAULT
      });
    }
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() ?? undefined });
    const args = registrationArgs({
      token,
      os: Platform.OS,
      timeZone: deviceTimeZone(),
      appVersion: Constants.expoConfig?.version,
    });
    if (!args) return 'failed';
    const { error } = await supabase.rpc('register_device_token', args);
    return error ? 'failed' : 'ok';
  } catch {
    return 'failed';
  }
}

/**
 * The first reminder: asks for permission if it hasn't been asked yet, then registers this phone.
 * Call it from a person's own action (turning a switch on), never at launch.
 */
export async function enablePush(): Promise<RegisterResult> {
  const setup = await readPushSetup();
  if (setup.status === 'unsupported' || setup.status === 'no_project') return setup.status;
  if (setup.permission === 'denied') return 'denied';
  if (setup.permission === 'undetermined') {
    let granted = false;
    try {
      granted = (await Notifications.requestPermissionsAsync()).granted;
    } catch {
      granted = false;
    }
    if (!granted) return 'denied';
  }
  return registerToken();
}

/** On launch and resume: refreshes the token only if permission is already granted. Never asks. */
export async function refreshPushRegistration(): Promise<void> {
  const setup = await readPushSetup();
  if (setup.status !== 'ready' || setup.permission !== 'granted') return;
  await registerToken();
}

/**
 * Removes this phone's token for the signed-in person (RLS lets people delete their own rows).
 * Call before signing out. Quiet on any failure: sign out must never be blocked by this.
 */
export async function unregisterThisDevice(): Promise<void> {
  // Never hold up signing out for more than a moment.
  await Promise.race([removeToken(), new Promise<void>((resolve) => setTimeout(resolve, 3000))]);
}

async function removeToken(): Promise<void> {
  try {
    const setup = await readPushSetup();
    if (setup.status !== 'ready' || setup.permission !== 'granted' || !onlineManager.isOnline()) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() ?? undefined });
    await supabase.from('device_tokens').delete().eq('token', token);
  } catch {
    // Sign out goes ahead; a stale token just stops receiving once the server sees it fail.
  }
}
