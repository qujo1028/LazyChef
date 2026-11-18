import { useNetInfo } from '@react-native-community/netinfo';

/** True only when NetInfo says there is no connection. Unknown (null) is treated as online. */
export function useOffline(): boolean {
  const { isConnected, isInternetReachable } = useNetInfo();
  return isConnected === false || isInternetReachable === false;
}
