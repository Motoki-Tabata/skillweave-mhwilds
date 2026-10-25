import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { CONDITIONS, NAMES } from '../../support/fixtures'
import {
  click,
  installDomPolyfills,
  mountReadyApp,
  restoreStubs,
  stubBackend,
  textOf,
} from '../../support/mount'
import type { Mounted } from '../../support/mount'

// 007 受入基準 2（発動条件のトグル）
describe('ActivationConditionsCard', () => {
  let mounted: Mounted | null = null

  beforeAll(installDomPolyfills)
  afterEach(() => {
    mounted?.wrapper.unmount()
    mounted = null
    restoreStubs()
  })

  async function ready(): Promise<Mounted> {
    stubBackend()
    mounted = await mountReadyApp()
    return mounted
  }

  const fieldset = () => document.querySelector<HTMLElement>('fieldset[aria-label="発動条件"]')!
  const boxes = () => Array.from(fieldset().querySelectorAll<HTMLElement>('[role="checkbox"]'))

  it('マスターの発動条件をすべて辞書の名前でトグルに出し、既定はすべてオフ（オン 0 件）', async () => {
    await ready()
    const text = textOf(fieldset())
    for (const condition of CONDITIONS) expect(text).toContain(NAMES[condition.id])
    expect(boxes()).toHaveLength(CONDITIONS.length)
    expect(boxes().every((box) => box.getAttribute('aria-checked') === 'false')).toBe(true)
    expect(textOf(document.body)).toContain('オン 0 件')
    expect(textOf(document.body)).toContain('検索の後に変えたときは、次の検索から反映します。')
  })

  it('チップのどこを押しても切り替わり、件数が更新される。ストアにはトグルの並びの順で入る', async () => {
    const { conditions } = await ready()
    const label = fieldset().querySelectorAll('label')[1]
    await click(label)
    expect(boxes()[1].getAttribute('aria-checked')).toBe('true')
    expect(conditions.activeConditionIds).toEqual([conditions.conditionOptions[1].id])
    expect(textOf(document.body)).toContain('オン 1 件')
    await click(boxes()[0])
    expect(textOf(document.body)).toContain('オン 2 件')
    await click(boxes()[1])
    expect(conditions.activeConditionIds).toEqual([conditions.conditionOptions[0].id])
  })

  it('状態を保存しない（マウントし直すと既定のオフに戻る）', async () => {
    await ready()
    await click(boxes()[0])
    mounted?.wrapper.unmount()
    mounted = await mountReadyApp()
    expect(boxes().every((box) => box.getAttribute('aria-checked') === 'false')).toBe(true)
  })
})
