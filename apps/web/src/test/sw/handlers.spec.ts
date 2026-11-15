// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { handleFetch, type FetchContext } from '@/sw/handlers'
import { FONTS_CACHE, OCR_CACHE, precacheName } from '@/sw/config'
import {
  CONFIG,
  ORIGIN,
  FakeCacheStorage,
  fakeFetch,
  req,
  type FakeFetch,
} from '../support/serviceWorker'

const NAME = precacheName(CONFIG.version)
const OCR_URL = `${ORIGIN}/tesseract/worker.min.js`
const OCR_KEY = `${OCR_URL}?v=1111111111111111`
const FONT_URL = 'https://fonts.gstatic.com/s/a.woff2'
const CSS_URL = 'https://fonts.googleapis.com/css2?family=A'

function setup(routes: Record<string, string | Response>, offline = false) {
  const net: FakeFetch = fakeFetch(routes, { offline })
  const storage = new FakeCacheStorage(net)
  const pending: Promise<unknown>[] = []
  const ctx: FetchContext = {
    caches: storage.asCacheStorage(),
    fetch: net,
    config: CONFIG,
    origin: ORIGIN,
    waitUntil: (p) => void pending.push(p),
  }
  return { net, storage, ctx, flush: () => Promise.all(pending) }
}

const text = async (p: Promise<Response> | null) => (await p!).text()

describe('handleFetch', () => {
  it('AC-7: GET 以外と /api/ は null（respondWith しない）で、ネットワークにも触れない', () => {
    const { ctx, net } = setup({})
    expect(handleFetch(req(`${ORIGIN}/api/builds`, { method: 'POST' }), ctx)).toBeNull()
    expect(handleFetch(req(`${ORIGIN}/api/auth/me`), ctx)).toBeNull()
    expect(handleFetch(req(`${ORIGIN}/master-2026.11.1.en.json`), ctx)).toBeNull()
    expect(net.calls).toHaveLength(0)
  })

  it('AC-3: オフラインのナビゲーションは自分の版の / を返す', async () => {
    const { ctx, storage } = setup({}, true)
    storage.seed(NAME, { [`${ORIGIN}/`]: 'SHELL' })
    expect(await text(handleFetch(req(`${ORIGIN}/charms`, { mode: 'navigate' }), ctx))).toBe(
      'SHELL',
    )
  })

  it('AC-3: 殻がキャッシュに無ければネットワークへ送る', async () => {
    const { ctx, net } = setup({ [`${ORIGIN}/charms`]: 'NET' })
    expect(await text(handleFetch(req(`${ORIGIN}/charms`, { mode: 'navigate' }), ctx))).toBe('NET')
    expect(net.calls).toHaveLength(1)
  })

  it('AC-4: 一覧にあるファイルはキャッシュから返し、ネットワークへ行かない', async () => {
    const { ctx, storage, net } = setup({})
    storage.seed(NAME, { [`${ORIGIN}/master-2026.11.1.json`]: 'MASTER' })
    expect(await text(handleFetch(req(`${ORIGIN}/master-2026.11.1.json?x=1`), ctx))).toBe('MASTER')
    expect(net.calls).toHaveLength(0)
  })

  it('AC-8: 待機中の新しい版のキャッシュは返さず、自分の版だけを見る', async () => {
    const { ctx, storage } = setup({ [`${ORIGIN}/assets/main-1.js`]: 'NET' })
    storage.seed(precacheName('bbbbbbbbbbbbbbbb'), { [`${ORIGIN}/assets/main-1.js`]: 'NEW' })
    storage.seed(NAME, { [`${ORIGIN}/assets/main-1.js`]: 'OLD' })
    expect(await text(handleFetch(req(`${ORIGIN}/assets/main-1.js`), ctx))).toBe('OLD')
  })

  it('AC-5: OCR は初回に取得して D5 のキーで写し、以後はキャッシュから返す', async () => {
    const { ctx, storage, net, flush } = setup({ [OCR_URL]: 'CORE' })
    expect(await text(handleFetch(req(OCR_URL), ctx))).toBe('CORE')
    await flush()
    expect(storage.get(OCR_CACHE).urls()).toEqual([OCR_KEY])
    expect(await text(handleFetch(req(OCR_URL), ctx))).toBe('CORE')
    expect(net.calls).toHaveLength(1)
  })

  it('AC-5: 事前キャッシュには入れない（OCR の取得は事前キャッシュの版に書かない）', async () => {
    const { ctx, storage, flush } = setup({ [OCR_URL]: 'CORE' })
    await text(handleFetch(req(OCR_URL), ctx))
    await flush()
    expect(storage.names()).toEqual([OCR_CACHE])
  })

  it('AC-5: ok でない応答は写さない', async () => {
    const { ctx, storage, flush } = setup({ [OCR_URL]: new Response('x', { status: 500 }) })
    await handleFetch(req(OCR_URL), ctx)
    await flush()
    expect(storage.get(OCR_CACHE).urls()).toEqual([])
  })

  it('AC-6: フォント本体は初回に写し、オフラインでもキャッシュから返す', async () => {
    const online = setup({ [FONT_URL]: 'FONT' })
    await text(handleFetch(req(FONT_URL), online.ctx))
    await online.flush()
    expect(online.storage.get(FONTS_CACHE).urls()).toEqual([FONT_URL])
    const offline = setup({}, true)
    offline.storage.caches.set(FONTS_CACHE, online.storage.get(FONTS_CACHE))
    expect(await text(handleFetch(req(FONT_URL), offline.ctx))).toBe('FONT')
  })

  it('AC-6: CSS は写しを返しつつ裏で取り直して写し直す', async () => {
    const { ctx, storage, flush } = setup({ [CSS_URL]: 'NEW-CSS' })
    storage.seed(FONTS_CACHE, { [CSS_URL]: 'OLD-CSS' })
    expect(await text(handleFetch(req(CSS_URL), ctx))).toBe('OLD-CSS')
    await flush()
    expect(await (await storage.get(FONTS_CACHE).match(CSS_URL))!.text()).toBe('NEW-CSS')
  })

  it('AC-6: CSS の写しが無ければ取得して写す。ok でなければ写さない', async () => {
    const good = setup({ [CSS_URL]: 'CSS' })
    expect(await text(handleFetch(req(CSS_URL), good.ctx))).toBe('CSS')
    await good.flush()
    expect(good.storage.get(FONTS_CACHE).urls()).toEqual([CSS_URL])
    const bad = setup({ [CSS_URL]: new Response('', { status: 503 }) })
    await handleFetch(req(CSS_URL), bad.ctx)
    await bad.flush()
    expect(bad.storage.get(FONTS_CACHE).urls()).toEqual([])
  })

  it('AC-6: オフラインで裏の取り直しに失敗しても写しを返し、エラーにしない', async () => {
    const { ctx, storage, flush } = setup({}, true)
    storage.seed(FONTS_CACHE, { [CSS_URL]: 'OLD-CSS' })
    expect(await text(handleFetch(req(CSS_URL), ctx))).toBe('OLD-CSS')
    await expect(flush()).resolves.toBeDefined()
  })
})
