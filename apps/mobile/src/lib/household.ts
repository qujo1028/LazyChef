import { useQuery } from '@tanstack/react-query';
import type { Database } from '@lazychef/db-types';

import { supabase } from './supabase';
import { useSession } from './use-session';

export type HouseholdRole = Database['public']['Enums']['household_role'];

export type Membership = {
  role: HouseholdRole;
  joinedAt: string;
  household: { id: string; name: string; inviteCode: string };
};

export type HouseholdContext = {
  userId: string;
  email: string | null;
  profile: { displayName: string; avatarUrl: string | null; activeHouseholdId: string | null } | null;
  memberships: Membership[];
};

/**
 * Query keys for P1. Every household query starts with ['household', ...] so one
 * invalidateQueries({ queryKey: queryKeys.all }) refreshes them all (realtime, sign in, join).
 */
export const queryKeys = {
  all: ['household'] as const,
  context: (userId: string) => ['household', 'context', userId] as const,
  members: (householdId: string) => ['household', 'members', householdId] as const,
  invitePreview: (code: string) => ['household', 'invite-preview', code] as const,
  pantry: (householdId: string) => ['household', 'pantry', householdId] as const,
};

async function fetchHouseholdContext(userId: string, email: string | null): Promise<HouseholdContext> {
  const [profile, memberships] = await Promise.all([
    supabase.from('profiles').select('display_name, avatar_url, active_household_id').eq('id', userId).maybeSingle(),
    supabase
      .from('household_members')
      .select('role, joined_at, household:households(id, name, invite_code)')
      .eq('user_id', userId)
      .order('joined_at'),
  ]);
  if (profile.error) throw profile.error;
  if (memberships.error) throw memberships.error;
  return {
    userId,
    email,
    profile: profile.data
      ? {
          displayName: profile.data.display_name,
          avatarUrl: profile.data.avatar_url,
          activeHouseholdId: profile.data.active_household_id,
        }
      : null,
    memberships: memberships.data.flatMap<Membership>(({ role, joined_at, household }) =>
      household
        ? [{ role, joinedAt: joined_at, household: { id: household.id, name: household.name, inviteCode: household.invite_code } }]
        : [],
    ),
  };
}

/** The signed-in person's profile and households (same shape as the web app's getHouseholdContext). */
export function useHouseholdContext() {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  return useQuery({
    queryKey: queryKeys.context(userId ?? 'signed-out'),
    queryFn: () => fetchHouseholdContext(userId!, session?.user.email ?? null),
    enabled: userId !== null,
  });
}

/** Picks the active household: the profile's choice, else the first one joined. */
export function pickActiveMembership(context: HouseholdContext | undefined): Membership | null {
  if (!context) return null;
  return (
    context.memberships.find((m) => m.household.id === context.profile?.activeHouseholdId) ??
    context.memberships[0] ??
    null
  );
}

/** The active household and the viewer's role in it, or null while loading or with no household. */
export function useActiveHousehold() {
  const query = useHouseholdContext();
  const active = pickActiveMembership(query.data);
  return { ...query, membership: active, household: active?.household ?? null, role: active?.role ?? null };
}
