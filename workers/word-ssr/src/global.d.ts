// Cloudflare Workers' CacheStorage exposes a `default` Cache instance beyond
// the standard DOM CacheStorage interface. @cloudflare/workers-types declares
// its own CacheStorage as a class, which does not merge with the DOM lib's
// CacheStorage interface — and DOM lib stays required here because this
// Worker's src/render-entry.tsx transitively imports application code that
// needs `window`/`document` types. This augments the DOM interface directly
// instead, which is a plain interface-to-interface merge.
declare global {
  interface CacheStorage {
    readonly default: Cache;
  }
}

export {};
