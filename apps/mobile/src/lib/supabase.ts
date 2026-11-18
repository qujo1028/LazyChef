import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import type { Database } from '@lazychef/db-types';

import { sessionStorage } from './secure-storage';

// Public values only. The publishable key is safe to ship; never put a secret key in the app.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(url && publishableKey);

if (!isSupabaseConfigured) {
  // Do not throw at import: that would white-screen the whole app. Requests fail instead.
  console.error(
    'Supabase is not configured. Copy apps/mobile/.env.example to .env.local and set ' +
      'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, then restart Expo.',
  );
}

export const supabase = createClient<Database>(
  url || 'http://localhost:54321',
  publishableKey || 'missing-publishable-key',
  {
    auth: {
      storage: sessionStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  },
);

// Only refresh tokens while the app is in the foreground (supabase-js React Native guidance).
if (Platform.OS !== 'web') {
  const sync = (state: string) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  };
  sync(AppState.currentState ?? 'active');
  AppState.addEventListener('change', sync);
}
