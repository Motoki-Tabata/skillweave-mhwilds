// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CONFIG, ORIGIN, FakeCacheStorage, fakeFetch } from '../support/serviceWorker'
import { precacheName } from '@/sw/config'

type Handler = (event: Record<string, unknown>) => void

async function boot(routes: Record<string, string>) {
  const handlers = new Map<string, Handler>()
  const net = fakeFetch(routes)
  const storage = new FakeCacheStorage(net)
  const claim = vi.fn(async () => undefined)
  const skipWaiting = vi.fn(async () => undefined)
  vi.stubGlobal('self', {
    __SWV_PRECACHE__: CONFIG,
    addEventListener: (type: string, h: Handler) => handlers.set(type, h),
    caches: storage.asCacheStorage(),
    clients: { claim },
    skipWaiting,
    location: { origin: ORIGIN },
  })
  vi.stubGlobal('fetch', net)
  vi.resetModules()
  // sw.ts は DOM の型の project に入れない（TS6307）ため、型に現れない動的な指定で読む。
  const entry = `${import.meta.dirname}/../../main/sw/${'sw'}.ts`
  await import(/* @vite-ignore */ entry)
  return { handlers, storage, claim, skipWaiting }
}

afterEach(() => vi.unstubAllGlobals())

describe('sw.ts の結線', () => {
  it('AC-2: install と activate が waitUntil に処理を渡す', async () => {
    const routes = Object.fromEntries(CONFIG.urls.map((u) => [`${ORIGIN}${u}`, u]))
    const { handlers, storage, claim, skipWaiting } = await boot(routes)
    const waits: Promise<unknown>[] = []
    handlers.get('install')!({ waitUntil: (p: Promise<unknown>) => waits.push(p) })
    await Promise.all(waits.splice(0))
    expect(storage.names()).toEqual([precacheName(CONFIG.version)])
    expect(skipWaiting).not.toHaveBeenCalled() // AC-8: install では skipWaiting しない
    handlers.get('activate')!({ waitUntil: (p: Promise<unknown>) => waits.push(p) })
    await Promise.all(waits)
    expect(claim).toHaveBeenCalledOnce()
  })

  it('AC-9: SKIP_WAITING のときだけ skipWaiting を呼ぶ', async () => {
    const { handlers, skipWaiting } = await boot({})
    const event = (data: unknown) => ({ data, waitUntil: vi.fn() })
    handlers.get('message')!(event({ type: 'OTHER' }))
    expect(skipWaiting).not.toHaveBeenCalled()
    handlers.get('message')!(event({ type: 'SKIP_WAITING' }))
    expect(skipWaiting).toHaveBeenCalledOnce()
  })

  it('AC-7: 扱わない要求には respondWith しない。扱う要求には応答を渡す', async () => {
    const { handlers, storage } = await boot({})
    storage.seed(precacheName(CONFIG.version), { [`${ORIGIN}/assets/main-1.js`]: 'JS' })
    const ignored = {
      request: new Request(`${ORIGIN}/api/me`),
      respondWith: vi.fn(),
      waitUntil: vi.fn(),
    }
    handlers.get('fetch')!(ignored)
    expect(ignored.respondWith).not.toHaveBeenCalled()
    const handled = {
      request: new Request(`${ORIGIN}/assets/main-1.js`),
      respondWith: vi.fn(),
      waitUntil: vi.fn(),
    }
    handlers.get('fetch')!(handled)
    expect(handled.respondWith).toHaveBeenCalledOnce()
    expect(await (await handled.respondWith.mock.calls[0]![0]).text()).toBe('JS')
  })
})
