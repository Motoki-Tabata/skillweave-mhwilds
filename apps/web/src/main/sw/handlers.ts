import { FONTS_CACHE, OCR_CACHE, ocrKey, precacheName, type PrecacheConfig } from './config'
import { classify } from './route'

export interface FetchContext {
  caches: CacheStorage
  fetch: (request: Request) => Promise<Response>
  config: PrecacheConfig
  origin: string
  waitUntil: (promise: Promise<unknown>) => void
}

function store(cache: Cache, key: string, response: Response, ctx: FetchContext): void {
  // response.ok の応答だけを写す（不透明な応答は ok が偽になる）。
  if (!response.ok) return
  const copy = response.clone()
  ctx.waitUntil(cache.put(key, copy).catch(() => undefined))
}

async function fromPrecache(path: string, request: Request, ctx: FetchContext): Promise<Response> {
  // 全キャッシュを探さず、自分の版のキャッシュだけを開く（待機中の新しい版を返さない）。
  const cache = await ctx.caches.open(precacheName(ctx.config.version))
  return (await cache.match(ctx.origin + path)) ?? ctx.fetch(request)
}

async function cacheFirst(
  cacheName: string,
  key: string,
  request: Request,
  ctx: FetchContext,
): Promise<Response> {
  const cache = await ctx.caches.open(cacheName)
  const hit = await cache.match(key)
  if (hit) return hit
  const response = await ctx.fetch(request)
  store(cache, key, response, ctx)
  return response
}

async function staleWhileRevalidate(request: Request, ctx: FetchContext): Promise<Response> {
  const cache = await ctx.caches.open(FONTS_CACHE)
  const key = request.url
  const hit = await cache.match(key)
  if (!hit) {
    const response = await ctx.fetch(request)
    store(cache, key, response, ctx)
    return response
  }
  ctx.waitUntil(
    ctx
      .fetch(request.clone())
      .then((response) => store(cache, key, response, ctx))
      .catch(() => undefined),
  )
  return hit
}

/** 扱う要求なら応答の Promise を返し、扱わない（ブラウザに任せる）ときは null を返す。 */
export function handleFetch(request: Request, ctx: FetchContext): Promise<Response> | null {
  const route = classify(request, ctx.origin, ctx.config)
  const { pathname } = new URL(request.url)
  switch (route) {
    case 'shell':
      return fromPrecache(ctx.config.base, request, ctx)
    case 'precache':
      return fromPrecache(pathname, request, ctx)
    case 'ocr': {
      const key = ctx.origin + ocrKey(pathname, ctx.config.ocrHashes[pathname]!)
      return cacheFirst(OCR_CACHE, key, request, ctx)
    }
    case 'fonts-static':
      return cacheFirst(FONTS_CACHE, request.url, request, ctx)
    case 'fonts-css':
      return staleWhileRevalidate(request, ctx)
    default:
      return null
  }
}
