import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { installDomPolyfills, mountApp, restoreStubs, stubBackend, textOf } from '../support/mount'
import type { Mounted } from '../support/mount'

// 039 not-found-route の AC-1・AC-2
describe('NotFoundView（どの経路にも一致しないパス）', () => {
  let mounted: Mounted | null = null
  const originalTitle = document.title

  beforeAll(installDomPolyfills)
  beforeEach(() => stubBackend())
  afterEach(() => {
    mounted?.wrapper.unmount()
    mounted = null
    restoreStubs()
    document.title = originalTitle
  })

  async function open(path: string): Promise<Mounted> {
    mounted = await mountApp({ path })
    await vi.waitFor(() => {
      if (mounted?.wrapper.find('h1').exists() !== true) throw new Error('no h1')
    })
    return mounted
  }

  it('AC-1: 既存の枠（ヘッダー・ナビ・クレジットのバー）の中に見出しと本文を出す', async () => {
    const { wrapper } = await open('/no-such-page')
    expect(document.body.querySelector('header')).not.toBeNull()
    expect(document.body.querySelector('nav')).not.toBeNull()
    expect(document.body.querySelector('footer')).not.toBeNull()
    const main = wrapper.find('main')
    expect(main.find('h1').text()).toBe('ページが見つかりません')
    expect(textOf(main.element)).toContain('URL が間違っているか')
  })

  it('AC-1: ページのタイトルを「ページが見つかりません | SkillWeave」にする', async () => {
    await open('/no-such-page')
    expect(document.title).toBe('ページが見つかりません | SkillWeave')
  })

  it('AC-1: ナビのどのリンクにも aria-current="page" が付かない', async () => {
    await open('/no-such-page')
    const nav = document.body.querySelector('nav')!
    expect(nav.querySelector('[aria-current="page"]')).toBeNull()
  })

  it('AC-2: 「装備検索へ」は / へのリンクで、押すと装備検索に移る', async () => {
    const { wrapper } = await open('/no-such-page')
    const link = wrapper
      .find('main')
      .findAll('a')
      .find((a) => a.text() === '装備検索へ')!
    expect(link.attributes('href')).toBe('/')
    await link.trigger('click')
    await vi.waitFor(() => expect(document.title).toBe('装備検索 | SkillWeave'))
    expect(wrapper.find('main h1').exists() ? wrapper.find('main h1').text() : '').not.toBe(
      'ページが見つかりません',
    )
  })
})
