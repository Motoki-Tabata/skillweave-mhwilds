// SW の単体テスト用の偽物（Cache Storage・ネットワーク）。plan.md D16。
import type { PrecacheConfig } from '@/sw/config'

export const ORIGIN = 'https://swv.test'

export const CONFIG: PrecacheConfig = {
  version: 'aaaaaaaaaaaaaaaa',
  base: '/',
  urls: ['/', '/assets/main-1.js', '/master-2026.11.1.json', '/manifest.webmanifest'],
  ocrHashes: {
    '/tesseract/worker.min.js': '1111111111111111',
    '/tesseract/lang/jpn.traineddata.gz': '2222222222222222',
  },
}

export type FakeFetch = ((request: Request) => Promise<Response>) & { calls: Request[] }

/** URL（`ORIGIN` 以外は絶対 URL）→ 本文。無い URL は reject（オフライン）。 */
export function fakeFetch(
  routes: Record<string, string | Response | (() => Response)>,
  options: { offline?: boolean } = {},
): FakeFetch {
  const calls: Request[] = []
  const fn = async (request: Request) => {
    calls.push(request)
    const route = options.offline ? undefined : routes[request.url]
    if (route === undefined) throw new TypeError('Failed to fetch')
    if (typeof route === 'string') return new Response(route)
    return typeof route === 'function' ? route() : route.clone()
  }
  return Object.assign(fn, { calls })
}

function keyOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  return input instanceof URL ? input.href : input.url
}

export class FakeCache {
  readonly entries = new Map<string, Response>()
  readonly addAllCalls: Request[][] = []

  constructor(private readonly fetcher: FakeFetch) {}

  async match(input: RequestInfo | URL): Promise<Response | undefined> {
    return this.entries.get(keyOf(input))?.clone()
  }

  async put(input: RequestInfo | URL, response: Response): Promise<void> {
    this.entries.set(keyOf(input), response)
  }

  async addAll(requests: Request[]): Promise<void> {
    this.addAllCalls.push(requests)
    const responses = await Promise.all(requests.map((request) => this.fetcher(request)))
    const failed = responses.find((response) => !response.ok)
    if (failed) throw new TypeError(`bad status ${failed.status}`)
    requests.forEach((request, i) => this.entries.set(request.url, responses[i]!))
  }

  async delete(input: RequestInfo | URL): Promise<boolean> {
    return this.entries.delete(keyOf(input))
  }

  async keys(): Promise<Request[]> {
    return [...this.entries.keys()].map((key) => new Request(key))
  }

  urls(): string[] {
    return [...this.entries.keys()]
  }
}

export class FakeCacheStorage {
  readonly caches = new Map<string, FakeCache>()

  constructor(private readonly fetcher: FakeFetch) {}

  /** 名前を指定してキャッシュを用意する（テストの前提づくり）。 */
  seed(name: string, urls: Record<string, string> = {}): FakeCache {
    const cache = new FakeCache(this.fetcher)
    for (const [url, body] of Object.entries(urls)) cache.entries.set(url, new Response(body))
    this.caches.set(name, cache)
    return cache
  }

  names(): string[] {
    return [...this.caches.keys()]
  }

  get(name: string): FakeCache {
    const cache = this.caches.get(name)
    if (!cache) throw new Error(`no cache ${name}`)
    return cache
  }

  async open(name: string): Promise<FakeCache> {
    return this.caches.get(name) ?? this.seed(name)
  }

  async has(name: string): Promise<boolean> {
    return this.caches.has(name)
  }

  async delete(name: string): Promise<boolean> {
    return this.caches.delete(name)
  }

  async keys(): Promise<string[]> {
    return this.names()
  }

  asCacheStorage(): CacheStorage {
    return this as unknown as CacheStorage
  }
}

/** `mode: 'navigate'` の Request は構成できないので、mode だけ上書きして作る。 */
export function req(url: string, init: { method?: string; mode?: RequestMode } = {}): Request {
  const request = new Request(url, { method: init.method ?? 'GET' })
  if (init.mode) Object.defineProperty(request, 'mode', { value: init.mode })
  return request
}
