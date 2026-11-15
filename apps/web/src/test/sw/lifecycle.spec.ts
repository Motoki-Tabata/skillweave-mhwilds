// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { activate, install, isSkipWaiting } from '@/sw/lifecycle'
import { OCR_CACHE, FONTS_CACHE, precacheName } from '@/sw/config'
import { CONFIG, ORIGIN, FakeCacheStorage, fakeFetch } from '../support/serviceWorker'

const NAME = precacheName(CONFIG.version)
const allOk = Object.fromEntries(CONFIG.urls.map((u) => [`${ORIGIN}${u}`, `body ${u}`]))

describe('install', () => {
  it('AC-2: 一覧のすべてを cache: reload で取得して自分の版のキャッシュに入れる', async () => {
    const storage = new FakeCacheStorage(fakeFetch(allOk))
    await install(CONFIG, storage.asCacheStorage(), ORIGIN)
    const cache = storage.get(NAME)
    expect(cache.urls().sort()).toEqual(CONFIG.urls.map((u) => `${ORIGIN}${u}`).sort())
    expect(cache.addAllCalls[0]!.every((r) => r.cache === 'reload')).toBe(true)
  })

  it('AC-10: 取得に失敗したらその版のキャッシュを消して例外を投げ直す', async () => {
    const { [`${ORIGIN}/assets/main-1.js`]: _omit, ...partial } = allOk
    const storage = new FakeCacheStorage(fakeFetch(partial))
    storage.seed(precacheName('bbbbbbbbbbbbbbbb'), { x: 'old' })
    await expect(install(CONFIG, storage.asCacheStorage(), ORIGIN)).rejects.toThrow(
      'Failed to fetch',
    )
    expect(storage.names()).toEqual([precacheName('bbbbbbbbbbbbbbbb')])
  })
})

describe('activate', () => {
  it('AC-9: 古い版の事前キャッシュを消し、利用時キャッシュと別名のキャッシュは残す', async () => {
    const storage = new FakeCacheStorage(fakeFetch({}))
    storage.seed(NAME)
    storage.seed(precacheName('bbbbbbbbbbbbbbbb'))
    storage.seed(FONTS_CACHE, { f: 'font' })
    storage.seed('other-cache')
    await activate(CONFIG, storage.asCacheStorage(), ORIGIN, async () => undefined)
    expect(storage.names().sort()).toEqual([FONTS_CACHE, 'other-cache', NAME].sort())
    expect(storage.get(FONTS_CACHE).urls()).toEqual(['f'])
  })

  it('AC-9: OCR は今のキーに無いエントリだけ消す', async () => {
    const storage = new FakeCacheStorage(fakeFetch({}))
    const keep = `${ORIGIN}/tesseract/worker.min.js?v=1111111111111111`
    storage.seed(OCR_CACHE, {
      [keep]: 'k',
      [`${ORIGIN}/tesseract/worker.min.js?v=0000000000000000`]: 'old',
    })
    await activate(CONFIG, storage.asCacheStorage(), ORIGIN, async () => undefined)
    expect(storage.get(OCR_CACHE).urls()).toEqual([keep])
  })

  it('AC-9: OCR のキャッシュが無くても作らない', async () => {
    const storage = new FakeCacheStorage(fakeFetch({}))
    await activate(CONFIG, storage.asCacheStorage(), ORIGIN, async () => undefined)
    expect(storage.names()).toEqual([])
  })

  it('AC-2: 掃除のあとに clients.claim を呼ぶ', async () => {
    const storage = new FakeCacheStorage(fakeFetch({}))
    storage.seed(precacheName('bbbbbbbbbbbbbbbb'))
    const claim = vi.fn(async () => {
      expect(storage.names()).toEqual([])
    })
    await activate(CONFIG, storage.asCacheStorage(), ORIGIN, claim)
    expect(claim).toHaveBeenCalledOnce()
  })
})

describe('isSkipWaiting', () => {
  it('AC-9: SKIP_WAITING のメッセージだけ真', () => {
    expect(isSkipWaiting({ type: 'SKIP_WAITING' })).toBe(true)
    expect(isSkipWaiting({ type: 'OTHER' })).toBe(false)
    expect(isSkipWaiting(null)).toBe(false)
    expect(isSkipWaiting('SKIP_WAITING')).toBe(false)
  })
})
