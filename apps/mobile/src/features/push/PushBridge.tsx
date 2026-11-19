// Mounted once in the root layout (inside the providers, so useToast works) for signed-in people
// with a household. It never asks for permission: it re-registers an already-allowed phone on
// launch and resume, shows a push that arrives while the app is open as an in-app toast, and
// opens the right screen when a push is tapped (including a tap that launched the app).
import * as Notifications from 'expo-notifications';
import { useRootNavigationState, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { useToast } from '@/components/Toast';
import { createTapGuard, tapRouteFor, toastMessage } from '@/lib/push-state';

import { refreshPushRegistration } from './device';

// Module scope so a remount (sign out, sign in as someone else) can't replay an old tap.
const tapGuard = createTapGuard();

export function PushBridge() {
  // Expo web has no push: skip every notifications call there.
  return Platform.OS === 'web' ? null : <NativePushBridge />;
}

function NativePushBridge() {
  const router = useRouter();
  const toast = useToast();
  const navigationReady = useRootNavigationState()?.key != null;
  

  // Re-register on launch and each time the app comes back to the front.
  useEffect(() => {
    void refreshPushRegistration();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshPushRegistration();
    });
    return () => sub.remove();
  }, []);

  // A push while the app is open: no system banner, an in-app toast with a way to open it.
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const { title, body, data } = notification.request.content;
      const route = tapRouteFor(data);
      toast.show({
        message: toastMessage({ title, body }),
        id: 'push',
        action: { label: 'Open', onPress: () => router.push(route) },
      });
    });
    return () => sub.remove();
  }, [router, toast]);

  // Set once: no system banner while the app is open (the toast above replaces it).
  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: false,
        shouldShowList: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  }, []);

  // Taps while running, plus the tap that cold-started the app. The guard makes each count once.
  const lastResponse = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!navigationReady || !lastResponse) return;
    if (lastResponse.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    if (!tapGuard.first(lastResponse)) return;
    router.push(tapRouteFor(lastResponse.notification.request.content.data));
    Notifications.clearLastNotificationResponse();
  }, [navigationReady, lastResponse, router]);

  return null;
}
