import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { WEAPON_LIST_LIMIT } from '@/constants/search'
import { makeBundle, makeDictionary, wp } from '../../support/fixtures'
import {
  click,
  findByLabel,
  installDomPolyfills,
  mountReadyApp,
  restoreStubs,
  stubBackend,
  textOf,
} from '../../support/mount'
import type { Mounted } from '../../support/mount'

// 受入基準 3（武器の絞り込みと選択）・P3 の武器カード
describe('WeaponDialog（D1）と武器カード', () => {
  let mounted: Mounted | null = null

  beforeAll(installDomPolyfills)
  afterEach(() => {
    mounted?.wrapper.unmount()
    mounted = null
    restoreStubs()
  })

  const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')
  const cards = () => Array.from(dialog()?.querySelectorAll('ul li button') ?? [])
  const cardNames = () => cards().map((b) => textOf(b.querySelector('span span')))

  async function open(options: Parameters<typeof stubBackend>[0] = {}): Promise<Mounted> {
    stubBackend(options)
    mounted = await mountReadyApp()
    const trigger = Array.from(document.querySelectorAll('button')).find((b) =>
      textOf(b).includes('武器を選択'),
    )!
    await click(trigger)
    expect(dialog()).not.toBeNull()
    return mounted
  }

  async function setQuery(value: string): Promise<void> {
    const input = findByLabel('武器名で検索') as HTMLInputElement
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
  }

  it('見出し・武器種のボタン（マスターに含まれる種類だけを定数の順で。正式名は aria-label）・検索欄を出す', async () => {
    await open()
    expect(textOf(dialog()!.querySelector('h2'))).toBe('武器を選択')
    const group = findByLabel('武器種')
    const buttons = Array.from(group.querySelectorAll('button'))
    expect(buttons.map((b) => textOf(b))).toEqual(['すべて', '大剣', '太刀', '弓'])
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([null, '大剣', '太刀', '弓'])
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true')
    expect(findByLabel('武器名で検索')).toBeTruthy()
  })

  it('開いたときは「すべて」で、マスターの並びで全武器を出す。1行目に名前と武器種、2行目に攻撃力・会心・スロット', async () => {
    await open()
    expect(cardNames()).toEqual(['鉄の大剣', '鉄の太刀', '鉄の弓'])
    const first = textOf(cards()[0])
    expect(first).toContain('大剣')
    expect(first).toContain('攻撃力 250 ／ 会心 -15% ／ スロット Lv3・Lv1')
    expect(first).toContain('剛刃 Lv2')
  })

  it('武器種で絞り込む（押されているものは aria-pressed）', async () => {
    await open()
    await click(findByLabel('太刀'))
    expect(cardNames()).toEqual(['鉄の太刀'])
    expect(findByLabel('太刀').getAttribute('aria-pressed')).toBe('true')
    expect(findByLabel('武器種').querySelector('button')?.getAttribute('aria-pressed')).toBe(
      'false',
    )
  })

  it('名前で部分一致の絞り込みをする。0件のときは案内を出す', async () => {
    await open()
    await setQuery('大剣')
    expect(cardNames()).toEqual(['鉄の大剣'])
    await setQuery('存在しない')
    expect(cards()).toHaveLength(0)
    expect(textOf(dialog())).toContain('該当する武器がありません。武器種や名前を変えてください。')
  })

  it('一致が 50 件を超えるときは 50 件だけを出し、件数の案内を出す', async () => {
    const options = { extraGreatSwords: 60 }
    await open({ bundle: makeBundle(options), dictionary: makeDictionary(options) })
    // 大剣 61 + 太刀 1 + 弓 1
    expect(cards()).toHaveLength(WEAPON_LIST_LIMIT)
    expect(textOf(dialog())).toContain(
      'すべて 63 件のうち 50 件を表示しています。名前で絞り込んでください。',
    )
    await click(findByLabel('大剣'))
    expect(cards()).toHaveLength(WEAPON_LIST_LIMIT)
    expect(textOf(dialog())).toContain(
      '大剣 61 件のうち 50 件を表示しています。名前で絞り込んでください。',
    )
    await setQuery('試作大剣10')
    expect(cards()).toHaveLength(1)
    expect(textOf(dialog())).not.toContain('件のうち')
  })

  it('ちょうど 50 件のときは件数の案内を出さない', async () => {
    const options = { extraGreatSwords: 47 }
    await open({ bundle: makeBundle(options), dictionary: makeDictionary(options) })
    expect(cards()).toHaveLength(50)
    expect(textOf(dialog())).not.toContain('件のうち')
  })

  it('武器を押すと選んでダイアログを閉じ、武器カードに名前・諸元・スキルを出し、フォーカスをボタンに戻す', async () => {
    const m = await open()
    await click(cards()[0])
    await vi.waitFor(() => expect(dialog()).toBeNull())
    expect(m.conditions.weaponId).toBe(wp('great-sword:1'))
    const button = Array.from(document.querySelectorAll('button')).find((b) =>
      textOf(b).includes('鉄の大剣'),
    )!
    expect(textOf(button)).toContain('大剣 ／ 攻撃力 250 ／ 会心 -15% ／ スロット Lv3・Lv1')
    expect(textOf(button)).toContain('スキル: 剛刃 Lv2')
    expect(button.getAttribute('aria-haspopup')).toBe('dialog')
    await vi.waitFor(() => expect(document.activeElement).toBe(button))
  })

  it('スキルが無い武器は、スキルの行を出さない', async () => {
    const m = await open()
    await click(cards()[1])
    await vi.waitFor(() => expect(dialog()).toBeNull())
    expect(m.conditions.weaponId).toBe(wp('long-sword:1'))
    expect(document.body.textContent).not.toContain('スキル: ')
  })

  it('選択中の武器があるときは、その武器種で開き、その武器を aria-pressed にする', async () => {
    const m = await open()
    await click(cards()[1])
    await vi.waitFor(() => expect(dialog()).toBeNull())
    const trigger = Array.from(document.querySelectorAll('button')).find((b) =>
      textOf(b).includes('鉄の太刀'),
    )!
    await click(trigger)
    expect(cardNames()).toEqual(['鉄の太刀'])
    expect(cards()[0].getAttribute('aria-pressed')).toBe('true')
    expect(m.conditions.weaponErrorShown).toBe(false)
  })

  it('選ばずに閉じると、武器欄に「武器を選んでください。」を出す', async () => {
    const m = await open()
    await click(findByLabel('閉じる'))
    await vi.waitFor(() => expect(dialog()).toBeNull())
    expect(m.conditions.weaponErrorShown).toBe(true)
    expect(textOf(document.body)).toContain('武器を選んでください。')
  })
})
