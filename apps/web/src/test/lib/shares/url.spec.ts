import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { copyToClipboard, shareUrl } from '@/lib/shares/url'

function routerWith(base: string) {
  return createRouter({
    history: createMemoryHistory(base),
    routes: [{ path: '/s/:shortId', name: 'shared-build', component: { render: () => null } }],
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('shareUrl', () => {
  it('AC-1: origin とルートの href から共有の URL を組み立てる', () => {
    expect(shareUrl(routerWith('/'), 'Ab3dE6gH9jK2', 'http://localhost:5173')).toBe(
      'http://localhost:5173/s/Ab3dE6gH9jK2',
    )
  })

  it('AC-1: ルーターの base を含める（BASE_URL を自前で連結しない）', () => {
    expect(shareUrl(routerWith('/swv/'), 'Ab3dE6gH9jK2', 'https://example.test')).toBe(
      'https://example.test/swv/s/Ab3dE6gH9jK2',
    )
  })

  it('AC-1: origin を省略すると location.origin を使う', () => {
    expect(shareUrl(routerWith('/'), 'Ab3dE6gH9jK2')).toBe(`${location.origin}/s/Ab3dE6gH9jK2`)
  })
})

describe('copyToClipboard', () => {
  it('AC-8: writeText で書き込めたら true', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    expect(await copyToClipboard('http://x')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('http://x')
  })

  it('AC-8: 拒否されたときは false', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) },
    })
    expect(await copyToClipboard('http://x')).toBe(false)
  })

  it('AC-8: クリップボードを使えないときは false', async () => {
    vi.stubGlobal('navigator', {})
    expect(await copyToClipboard('http://x')).toBe(false)
  })
})
