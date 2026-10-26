import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { WEAPON_LIST_LIMIT } from '@/constants/search'
import { makeBundle, makeDictionary, wp } from '../../support/fixtures'
import { createMemoryWeaponRepository } from '../../support/weaponRepository'
import type { WeaponRepository } from '@/lib/weapons/storage'
import {
  ARTIA_BOW,
  makeWeaponBundle,
  makeWeaponDictionary,
  storedWeapon,
  weaponId,
} from '../../support/weapons'
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
    expect(m.conditions.selection).toEqual({ kind: 'master', weaponId: wp('great-sword:1') })
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
    expect(m.conditions.selection).toEqual({ kind: 'master', weaponId: wp('long-sword:1') })
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

// 受入基準 6・10・13（D1 の個体差のある武器の節、S1 の武器カード）
describe('WeaponDialog（D1）の個体差のある武器', () => {
  let mounted: Mounted | null = null

  beforeAll(installDomPolyfills)
  afterEach(() => {
    mounted?.wrapper.unmount()
    mounted = null
    restoreStubs()
    document.body.innerHTML = ''
  })

  const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')
  const customCards = () =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('[data-custom-weapon-id]'))
  const headings = () => Array.from(dialog()?.querySelectorAll('h3') ?? []).map((h) => textOf(h))

  async function open(repository: WeaponRepository | undefined): Promise<Mounted> {
    stubBackend({ bundle: makeWeaponBundle(), dictionary: makeWeaponDictionary() })
    mounted = await mountReadyApp({ weaponRepository: repository })
    const trigger = Array.from(document.querySelectorAll('button')).find((b) =>
      textOf(b).includes('武器を選択'),
    )!
    await click(trigger)
    return mounted
  }

  async function opened(...payloads: Parameters<typeof storedWeapon>[]): Promise<Mounted> {
    const m = await open(createMemoryWeaponRepository(payloads.map((p) => storedWeapon(...p))))
    await vi.waitFor(() => expect(m.weapons.status).toBe('ready'))
    await flushPromises()
    return m
  }

  async function setQuery(value: string): Promise<void> {
    const input = findByLabel('武器名で検索') as HTMLInputElement
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
  }

  it('検索の候補になる個体差のある武器があるとき、「個体差のある武器（N）」と「通常の武器」の見出しを出し、カードに表示名・個体差・武器種・諸元・付与スキルを出す', async () => {
    await opened([1], [2, { name: '' }])
    expect(headings()).toEqual(['個体差のある武器（2）', '通常の武器'])
    // 登録の新しい順
    expect(customCards().map((b) => b.dataset.customWeaponId)).toEqual([weaponId(2), weaponId(1)])
    const text = textOf(customCards()[1])
    expect(text).toContain('巨戟ブレイド')
    expect(text).toContain('個体差')
    expect(text).toContain('大剣')
    expect(text).toContain('攻撃力 200 ／ 会心 15% ／ 火属性 300 ／ スロット Lv3・Lv1')
    expect(text).toContain('（シリーズ）')
    expect(text).toContain('（グループ）')
    expect(textOf(customCards()[0])).toContain('アーティアブレイドⅡ')
  })

  it('個体差のある武器が無いときは、節も「通常の武器」の見出しも出さない', async () => {
    await opened()
    expect(headings()).toEqual([])
    expect(customCards()).toHaveLength(0)
  })

  it('基の武器・付与スキルが現行のマスターに無い武器は、選択肢に出さない', async () => {
    await opened([1], [2, { baseWeaponId: wp('great-sword:1') }])
    expect(customCards().map((b) => b.dataset.customWeaponId)).toEqual([weaponId(1)])
    expect(headings()[0]).toBe('個体差のある武器（1）')
  })

  it('武器種のボタンは基の武器の武器種で、検索欄は表示名と基の武器の名前の両方で絞り込む', async () => {
    await opened([1], [2, { baseWeaponId: ARTIA_BOW, name: '弓の子' }])
    await click(findByLabel('弓'))
    expect(customCards().map((b) => b.dataset.customWeaponId)).toEqual([weaponId(2)])
    expect(headings()[0]).toBe('個体差のある武器（1）')
    await click(findByLabel('武器種').querySelector('button')!)
    await setQuery('巨戟')
    expect(customCards().map((b) => b.dataset.customWeaponId)).toEqual([weaponId(1)])
    await setQuery('アーティアボウ')
    expect(customCards().map((b) => b.dataset.customWeaponId)).toEqual([weaponId(2)])
  })

  it('絞り込みで0件になったら、見出しの下に補助文を出す', async () => {
    await opened([1])
    await setQuery('該当なし')
    expect(headings()[0]).toBe('個体差のある武器（0）')
    expect(textOf(dialog())).toContain('この武器種・名前に合う個体差のある武器はありません。')
  })

  it('個体差のある武器を押すと選んで閉じ、武器カードに表示名・個体差・諸元・付与スキルと S3 へのリンクを出す', async () => {
    const m = await opened([1])
    await click(customCards()[0])
    await vi.waitFor(() => expect(dialog()).toBeNull())
    expect(m.conditions.selection).toEqual({ kind: 'custom', id: weaponId(1) })
    const button = Array.from(document.querySelectorAll('button')).find((b) =>
      textOf(b).includes('巨戟ブレイド'),
    )!
    const text = textOf(button)
    expect(text).toContain('個体差')
    expect(text).toContain('大剣 ／ 攻撃力 200 ／ 会心 15% ／ 火属性 300 ／ スロット Lv3・Lv1')
    expect(text).toContain('付与スキル:')
    const link = Array.from(document.querySelectorAll('a')).find(
      (a) => textOf(a) === '個体差のある武器の一覧へ',
    )!
    expect(link.getAttribute('href')).toBe('/weapons')
  })

  it('選択中の個体差のある武器は aria-pressed="true"', async () => {
    const m = await opened([1], [2])
    m.conditions.selectCustomWeapon(weaponId(2))
    await flushPromises()
    expect(customCards().map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false'])
  })

  it('読み込みが 300ms を超えたら、節の位置に読込中を出す。通常の武器は選べる', async () => {
    const m = await open({
      list: () => new Promise(() => {}),
      put: async () => {},
      delete: async () => {},
    })
    expect(textOf(dialog())).not.toContain('個体差のある武器を読み込んでいます…')
    await vi.waitFor(() =>
      expect(textOf(dialog())).toContain('個体差のある武器を読み込んでいます…'),
    )
    expect(m.weapons.status).toBe('loading')
    expect(dialog()!.querySelector('output')).not.toBeNull()
    expect(dialog()!.querySelectorAll('ul li button').length).toBeGreaterThan(0)
  })

  it('読み込みに失敗したら、警告の帯に原因と通常の武器から選べることを出す', async () => {
    const repository = createMemoryWeaponRepository([storedWeapon(1)])
    repository.failWith('list', 'unknown')
    const m = await open(repository)
    await vi.waitFor(() => expect(m.weapons.status).toBe('failed'))
    await flushPromises()
    expect(textOf(dialog())).toContain(
      '個体差のある武器を読み込めませんでした（端末への保存（IndexedDB）に失敗しました。）。通常の武器から選べます。',
    )
    expect(customCards()).toHaveLength(0)
    expect(headings()).toEqual([])
  })
})
