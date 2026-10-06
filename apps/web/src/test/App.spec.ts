import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  installDomPolyfills,
  mountApp,
  mountReadyApp,
  restoreStubs,
  stubBackend,
} from './support/mount'
import type { Mounted } from './support/mount'

// 受入基準 10（共通レイアウトの二次創作の表記とクレジット）
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
