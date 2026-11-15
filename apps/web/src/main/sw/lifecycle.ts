import { OCR_CACHE, PRECACHE_PREFIX, ocrKey, precacheName, type PrecacheConfig } from './config'

/** install: 一覧をすべて取得して自分の版のキャッシュに入れる。失敗したらそのキャッシュを消して投げ直す。 */
export async function install(
  config: PrecacheConfig,
  caches: CacheStorage,
  origin: string,
): Promise<void> {
  const name = precacheName(config.version)
  const cache = await caches.open(name)
  try {
    // HTTP のキャッシュの古い `/`・固定名のファイルを混ぜない。
    await cache.addAll(
      config.urls.map((url) => new Request(new URL(url, origin).href, { cache: 'reload' })),
    )
  } catch (error) {
    await caches.delete(name)
    throw error
  }
}

async function pruneOcr(config: PrecacheConfig, caches: CacheStorage, origin: string) {
  if (!(await caches.has(OCR_CACHE))) return
  const keep = new Set(
    Object.entries(config.ocrHashes).map(([path, hash]) => origin + ocrKey(path, hash)),
  )
  const cache = await caches.open(OCR_CACHE)
  for (const request of await cache.keys()) {
    if (!keep.has(request.url)) await cache.delete(request)
  }
}

/** activate: 古い版の事前キャッシュと今のキーに無い OCR のエントリを消し、画面を制御下に置く。 */
export async function activate(
  config: PrecacheConfig,
  caches: CacheStorage,
  origin: string,
  claim: () => Promise<void>,
): Promise<void> {
  const current = precacheName(config.version)
  for (const name of await caches.keys()) {
    if (name.startsWith(PRECACHE_PREFIX) && name !== current) await caches.delete(name)
  }
  await pruneOcr(config, caches, origin)
  await claim()
}

/** message が `{ type: 'SKIP_WAITING' }` か。 */
export function isSkipWaiting(data: unknown): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === 'SKIP_WAITING'
  )
}
