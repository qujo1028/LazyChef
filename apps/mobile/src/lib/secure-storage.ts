import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { createChunkedStorage } from './chunked-storage';

// Session storage adapter for supabase-js. Native: expo-secure-store (Keychain / Keystore), chunked
// because of its ~2 KB value limit. Web (Expo web, layout checks only): localStorage.

type StorageAdapter = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const nativeStorage = createChunkedStorage({
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value),
  remove: (key) => SecureStore.deleteItemAsync(key),
});

const webStorage: StorageAdapter = {
  async getItem(key) {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async setItem(key, value) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    } catch {
      // Storage blocked: the session just won't persist.
    }
  },
  async removeItem(key) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};

export const sessionStorage: StorageAdapter = Platform.OS === 'web' ? webStorage : nativeStorage;
