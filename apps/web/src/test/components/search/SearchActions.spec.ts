import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { makeTableBundle, FakeWorker, wp } from '../../support/fixtures'
import {
  click,
  findButton,
  flushPromises,
  installDomPolyfills,
  mountReadyApp,
  restoreStubs,
  stubBackend,
  textOf,
} from '../../support/mount'
import type { Mounted } from '../../support/mount'

const NOTE =
  '登録した護石の代わりに、抽選テーブルから出うる護石で組めるかを調べます。目的・件数・護石の条件は使いません。'

// 017 の「護石を逆引き」の行（D16）
describe('SearchActions の逆引き', () => {
  let mounted: Mounted | null = null

  beforeAll(installDomPolyfills)
  afterEach(() => {
    mounted?.wrapper.unmount()
    mounted = null
    restoreStubs()
    document.body.innerHTML = ''
  })

  async function mountWith(options: { table?: boolean; weapon?: boolean } = {}) {
    stubBackend(options.table === false ? {} : { bundle: makeTableBundle() })
    const m = await mountReadyApp()
    mounted = m
    if (options.weapon !== false) m.conditions.selectWeapon(wp('great-sword:1'))
    await flushPromises()
    return m
  }

  const describedBy = (button: HTMLElement) =>
    textOf(document.getElementById(button.getAttribute('aria-describedby') ?? ''))

  it('AC-1: 「護石を逆引き」は type=button で、説明を aria-describedby で関連づけ、押すと逆引きを始める', async () => {
    await mountWith()
    const button = findButton('護石を逆引き')
    expect(button.type).toBe('button')
    expect(button.disabled).toBe(false)
    expect(describedBy(button)).toBe(NOTE)
    await click(button)
    expect(FakeWorker.last.messages('reverseLookup')).toHaveLength(1)
    expect(FakeWorker.last.messages('solve')).toHaveLength(0)
  })

  it('AC-12: 「検索」のボタンは submit のままで、押しても逆引きを始めない', async () => {
    await mountWith()
    await click(document.querySelector('button[type="submit"]')!)
    expect(FakeWorker.last.messages('solve')).toHaveLength(1)
    expect(FakeWorker.last.messages('reverseLookup')).toHaveLength(0)
  })

  it('AC-8: 武器が未選択のときは無効で、理由が説明の代わりになる', async () => {
    await mountWith({ weapon: false })
    const button = findButton('護石を逆引き')
    expect(button.disabled).toBe(true)
    expect(describedBy(button)).toBe('武器を選ぶと逆引きできます。')
  })

  it('AC-8: 抽選テーブルが無いマスターでは無効で、未整備の理由を出す', async () => {
    await mountWith({ table: false })
    const button = findButton('護石を逆引き')
    expect(button.disabled).toBe(true)
    expect(describedBy(button)).toBe('抽選テーブルが未整備のため、逆引きできません。')
  })

  it('AC-9: 実行中はラベルが「逆引きし直す」になり有効のまま。「キャンセル」で逆引きを取り消す', async () => {
    const m = await mountWith()
    await click(findButton('護石を逆引き'))
    expect(findButton('逆引きし直す').disabled).toBe(false)
    const cancels = Array.from(document.querySelectorAll('button')).filter(
      (b) => textOf(b) === 'キャンセル',
    )
    expect(cancels.length).toBeGreaterThan(0)
    await click(cancels[0]!)
    expect(m.pinia.state.value.reverseLookup.status).toBe('idle')
    expect(FakeWorker.last.messages('cancel')).toHaveLength(1)
    expect(textOf(document.body)).toContain('逆引きをキャンセルしました。')
  })

  it('AC-12: 通常の検索の実行中も「キャンセル」は検索を取り消す', async () => {
    const m = await mountWith()
    await click(document.querySelector('button[type="submit"]')!)
    expect(findButton('検索し直す')).toBeTruthy()
    await click(findButton('キャンセル'))
    expect(m.search.status).toBe('idle')
    expect(m.pinia.state.value.reverseLookup.status).toBe('idle')
  })
})
