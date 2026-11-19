import { Redirect } from 'expo-router';

import { useHouseholdContext } from '@/lib/household';
import { useSession } from '@/lib/use-session';

/** Sends people to the right place: signed out, no household yet, or the app. */
export default function Index() {
  const { session } = useSession();
  const context = useHouseholdContext();
  if (!session) return <Redirect href="/welcome" />;
  if ((context.data?.memberships.length ?? 0) === 0) return <Redirect href="/onboarding" />;
  return <Redirect href="/home" />;
}
