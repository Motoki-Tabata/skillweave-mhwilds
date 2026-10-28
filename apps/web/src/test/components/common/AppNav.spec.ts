import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import {
  flushPromises,
  installDomPolyfills,
  mountReadyApp,
  restoreStubs,
  stubBackend,
} from '../../support/mount'
import type { Mounted } from '../../support/mount'

// 受入基準 14（ナビの行・今の画面の aria-current）／011 の画面設計 2.1（保存した構成・横スクロール）
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
  const list = () => document.querySelector<HTMLElement>('nav[aria-label="画面の切り替え"] ul')!

  it('「装備検索」「保存した構成」「護石」「個体差のある武器」の4つのリンクをこの順に出す', async () => {
    mounted = await mountReadyApp()
    expect(links().map((a) => [a.textContent?.trim(), a.getAttribute('href')])).toEqual([
      ['装備検索', '/'],
      ['保存した構成', '/builds'],
      ['護石', '/charms'],
      ['個体差のある武器', '/weapons'],
    ])
  })

  it('検索画面では「装備検索」だけに aria-current="page" を付ける', async () => {
    mounted = await mountReadyApp()
    expect(links().map((a) => a.getAttribute('aria-current'))).toEqual(['page', null, null, null])
  })

  it('保存した構成の一覧と詳細では「保存した構成」だけに aria-current="page" を付け、タイトルを替える', async () => {
    mounted = await mountReadyApp({ path: '/builds' })
    expect(links().map((a) => a.getAttribute('aria-current'))).toEqual([null, 'page', null, null])
    expect(document.title).toBe('保存した構成 | SkillWeave')
    await mounted.wrapper.vm.$router.push('/builds/01900000-0000-7000-8000-000000000001')
    await flushPromises()
    expect(links().map((a) => a.getAttribute('aria-current'))).toEqual([null, 'page', null, null])
    expect(document.title).toBe('保存した構成 | SkillWeave')
  })

  it('護石画面では「護石」だけに aria-current="page" を付け、ページのタイトルを替える', async () => {
    mounted = await mountReadyApp({ path: '/charms' })
    expect(links().map((a) => a.getAttribute('aria-current'))).toEqual([null, null, 'page', null])
    expect(document.title).toBe('護石 | SkillWeave')
  })

  it('個体差のある武器の画面では「個体差のある武器」だけに aria-current="page" を付ける', async () => {
    mounted = await mountReadyApp({ path: '/weapons' })
    expect(links().map((a) => a.getAttribute('aria-current'))).toEqual([null, null, null, 'page'])
  })

  it('ナビの行だけが横にスクロールでき、リンクは折り返さない', async () => {
    mounted = await mountReadyApp()
    expect(list().className).toContain('overflow-x-auto')
    expect(links().every((a) => a.className.includes('whitespace-nowrap'))).toBe(true)
  })

  it('リンクのフォーカスリングは内側に出し、横スクロールの行で上下が切れない', async () => {
    mounted = await mountReadyApp()
    expect(
      links().every(
        (a) =>
          a.className.includes('focus-visible:ring-inset') &&
          a.className.includes('focus-visible:ring-3'),
      ),
    ).toBe(true)
  })

  it('画面を移ると、右にはみ出した今のリンクが見える範囲に入るよう、行だけをスクロールする', async () => {
    mounted = await mountReadyApp()
    const ul = list()
    Object.defineProperty(ul, 'clientWidth', { configurable: true, value: 328 })
    const last = links()[3]!
    Object.defineProperty(last, 'offsetLeft', { configurable: true, value: 264 })
    Object.defineProperty(last, 'offsetWidth', { configurable: true, value: 136 })
    await mounted.wrapper.vm.$router.push('/weapons')
    await flushPromises()
    await nextTick()
    expect(ul.scrollLeft).toBe(264 + 136 - 328)
  })
})
