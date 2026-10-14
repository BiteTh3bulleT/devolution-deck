/** One request per lane in flight; merge unsent parameter patches, retaining the final gesture. */
export function parameterQueue<P extends object>(send: (key: string, patch: P) => Promise<void>) {
  const lanes = new Map<string, { pending: P | null; promise: Promise<void> }>();
  return (key: string, patch: P): Promise<void> => {
    const active = lanes.get(key);
    if (active) { active.pending = { ...active.pending, ...patch }; return active.promise; }
    const lane = { pending: patch as P | null, promise: Promise.resolve() };
    lane.promise = (async () => {
      await Promise.resolve();
      try {
        while (lane.pending) {
          const next = lane.pending; lane.pending = null;
          await send(key, next);
        }
      } finally { lanes.delete(key); }
    })();
    lanes.set(key, lane);
    return lane.promise;
  };
}
