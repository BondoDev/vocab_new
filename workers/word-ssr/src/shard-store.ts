// Production storage abstraction. A single interface (ShardStore) hides
// WHERE record shards physically live from the routing/rendering code in
// index.full.ts, so the active backend can change without touching the
// renderer. This exists specifically because the storage layer changed once
// already during this migration (R2 was the original plan; the account has
// R2 disabled and billing must not be enabled, so Cloudflare Workers Static
// Assets — via the existing `env.ASSETS` binding already used for the client
// bundle — is the active/primary implementation). If R2 becomes available
// later, only createR2ShardStore needs to be wired up as the active store;
// index.full.ts's call sites do not change.
export interface ShardStore {
  /** Fetch and JSON-parse one shard object. Returns null if it doesn't exist. */
  getShard<T = unknown>(objectKey: string): Promise<T | null>;
}

/**
 * PRIMARY, ACTIVE implementation. Serves shards from the Worker's own
 * Static Assets (the same `[assets]` binding that already serves the
 * production client bundle from ../../dist — see wrangler.full.toml).
 * Shard files are published under records/{dataVersion}/... by
 * publish-shards.mjs into the assets directory, so a plain path-based
 * `assets.fetch()` is all that's needed; no account API calls, no billing.
 */
export function createAssetsShardStore(assets: Fetcher, siteOrigin: string): ShardStore {
  return {
    async getShard<T>(objectKey: string): Promise<T | null> {
      const url = new URL(`/${objectKey}`, siteOrigin);
      const response = await assets.fetch(new Request(url.toString()));
      if (!response.ok) {
        return null;
      }
      return (await response.json()) as T;
    },
  };
}

/**
 * NOT USED TODAY — preserved so R2 can be adopted later (e.g. once R2 is
 * enabled on the account and a real budget is approved) by wiring this up
 * in index.full.ts instead of createAssetsShardStore, with no other code
 * changes required. Needs an `[[r2_buckets]]` binding, which
 * wrangler.full.toml deliberately does NOT declare right now.
 */
export function createR2ShardStore(bucket: R2Bucket): ShardStore {
  return {
    async getShard<T>(objectKey: string): Promise<T | null> {
      const object = await bucket.get(objectKey);
      if (!object) {
        return null;
      }
      return (await object.json()) as T;
    },
  };
}

/**
 * FALLBACK OPTION ONLY — not the primary store, not wired up by default.
 * Workers KV is available on this account's token (workers_kv: write) and
 * could serve small shards if Static Assets' file-count/size limits were
 * ever a concern, but KV's per-value 25MiB limit and eventually-consistent
 * writes make it a worse fit than Assets for a build-time-immutable,
 * version-namespaced dataset like this one. Kept here, unused, purely as a
 * documented escape hatch per the "keep KV only as a fallback option, not
 * the primary store" requirement.
 */
export function createKvShardStore(kv: KVNamespace): ShardStore {
  return {
    async getShard<T>(objectKey: string): Promise<T | null> {
      return kv.get<T>(objectKey, "json");
    },
  };
}

/**
 * In-isolate memoization wrapper — an OPTIMIZATION only, never the source of
 * truth. Wraps any ShardStore so repeated getShard() calls for the same key
 * within one Worker isolate's lifetime skip the underlying fetch/read. A
 * cold isolate (or one that's evicted this key) always falls through to the
 * real store.
 */
export function withInIsolateMemoization(store: ShardStore): ShardStore {
  const cache = new Map<string, Promise<unknown | null>>();
  return {
    async getShard<T>(objectKey: string): Promise<T | null> {
      if (!cache.has(objectKey)) {
        cache.set(objectKey, store.getShard(objectKey));
      }
      return cache.get(objectKey) as Promise<T | null>;
    },
  };
}
