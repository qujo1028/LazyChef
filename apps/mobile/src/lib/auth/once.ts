/**
 * Runs `task` once per key and gives later callers the same promise. A PKCE code can be used
 * only one time, and the same link can reach the app twice (the in-app browser result and the
 * deep link), so both callers share one exchange.
 */
export function createOnceRunner<T>(task: (key: string) => Promise<T>) {
  const runs = new Map<string, Promise<T>>();
  return (key: string): Promise<T> => {
    const existing = runs.get(key);
    if (existing) return existing;
    const run = task(key);
    runs.set(key, run);
    return run;
  };
}
