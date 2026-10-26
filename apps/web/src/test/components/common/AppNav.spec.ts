import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installDomPolyfills, mountReadyApp, restoreStubs, stubBackend } from '../../support/mount'
import type { Mounted } from '../../support/mount'

// 受入基準 14（ナビの行・今の画面の aria-current）
describe('AppNav（C1 ナビの行）', () => {
  let mounted: Mounted | null = null

  beforeAll(installDomPolyfills)
  beforeEach(() => stubBackend())
  afterEach(() => {
    mounted?.wrapper.unmount()
    mounted = null
    restoreStubs()
  })

  const links = () =>
    Array.from(document.querySelectorAll<HTMLAnchorElement>('nav[aria-label="画面の切り替え"] a'))

  it('「装備検索」「護石」「個体差のある武器」の3つのリンクを出す', async () => {
    mounted = await mountReadyApp()
    expect(links().map((a) => [a.textContent?.trim(), a.getAttribute('href')])).toEqual([
      ['装備検索', '/'],
      ['護石', '/charms'],
      ['個体差のある武器', '/weapons'],
    ])
  })

  it('検索画面では「装備検索」だけに aria-current="page" を付ける', async () => {
    mounted = await mountReadyApp()
    expect(links().map((a) => a.getAttribute('aria-current'))).toEqual(['page', null, null])
  })

  it('護石画面では「護石」だけに aria-current="page" を付け、ページのタイトルを替える', async () => {
    mounted = await mountReadyApp({ path: '/charms' })
    expect(links().map((a) => a.getAttribute('aria-current'))).toEqual([null, 'page', null])
    expect(document.title).toBe('護石 | SkillWeave')
  })

  it('個体差のある武器の画面では「個体差のある武器」だけに aria-current="page" を付ける', async () => {
    mounted = await mountReadyApp({ path: '/weapons' })
    expect(links().map((a) => a.getAttribute('aria-current'))).toEqual([null, null, 'page'])
  })
})
