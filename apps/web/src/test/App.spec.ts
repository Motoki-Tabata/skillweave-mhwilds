import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  installDomPolyfills,
  mountApp,
  mountReadyApp,
  restoreStubs,
  stubBackend,
} from './support/mount'
import type { Mounted } from './support/mount'

// 受入基準 11（共通レイアウトの二次創作の表記とクレジット）
describe('App（共通レイアウト C1）', () => {
  let mounted: Mounted | null = null

  beforeAll(installDomPolyfills)
  afterEach(() => {
    mounted?.wrapper.unmount()
    mounted = null
    restoreStubs()
  })

  const { repository, commit } = __SWV_MASTER__.source

  function expectCommonLayout(m: Mounted): void {
    const header = m.wrapper.get('header')
    expect(header.text()).toContain('SkillWeave')
    expect(header.text()).toContain('非公式の二次創作')
    const footer = m.wrapper.get('footer')
    expect(footer.text()).toContain(repository)
    expect(footer.text()).toContain(`@${commit.slice(0, 7)}`)
    expect(footer.text()).not.toContain(commit)
    expect(footer.attributes('aria-label')).toBe(
      `マスターデータの出典: MHDB ${repository} コミット ${commit}`,
    )
    expect(footer.attributes('title')).toBe(footer.attributes('aria-label'))
    // 030 AC-2: どの画面でもフッターに /privacy へのリンクがある
    const privacy = footer.get('a')
    expect(privacy.text()).toBe('プライバシー')
    expect(privacy.attributes('href')).toBe('/privacy')
    expect(privacy.attributes('title')).toBe('プライバシーの表記を開く')
  }

  it('読込前（P1）でもバッジとクレジットが出る', async () => {
    stubBackend({ hang: true })
    mounted = await mountApp()
    expect(mounted.master.status).toBe('loading')
    expectCommonLayout(mounted)
  })

  it('読込失敗（P2）でもバッジとクレジットが出る', async () => {
    stubBackend({ failMaster: true })
    mounted = await mountApp()
    await expect.poll(() => mounted?.master.status).toBe('failed')
    expectCommonLayout(mounted)
  })

  it('030 AC-2: /privacy ではリンクに aria-current="page" が付く', async () => {
    stubBackend({ hang: true })
    vi.stubGlobal('scrollTo', vi.fn()) // jsdom に window.scrollTo の実装が無い
    mounted = await mountApp({ path: '/privacy' })
    expect(mounted.wrapper.get('footer a').attributes('aria-current')).toBe('page')
  })

  describe('準備完了（P3）', () => {
    beforeEach(() => stubBackend())

    it('バッジとクレジットが出て、©CAPCOM の表記と画像・アイコンの img が無い', async () => {
      mounted = await mountReadyApp()
      expectCommonLayout(mounted)
      const text = document.body.textContent ?? ''
      expect(text).not.toContain('©')
      expect(text.toUpperCase()).not.toContain('CAPCOM')
      expect(document.body.querySelector('img')).toBeNull()
    })
  })
})
