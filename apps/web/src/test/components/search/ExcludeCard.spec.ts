import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import type { ArmorId, MasterArmor } from '@swv/data'
import { useLockExcludeStore } from '@/stores/lockExclude'
import { armorId, dc, makeBundle, makeDictionary } from '../../support/fixtures'
import {
  click,
  findByLabel,
  installDomPolyfills,
  mountReadyApp,
  restoreStubs,
  stubBackend,
  textOf,
  typeInto,
} from '../../support/mount'
import type { Mounted } from '../../support/mount'

const SLOW = 15000

// 020 受入基準 AC-5（除外の入力）・AC-7（固定との相互解除）・AC-8（検索の前の表示）
describe('ExcludeCard', () => {
  let mounted: Mounted | null = null

  beforeAll(installDomPolyfills)
  afterEach(() => {
    mounted?.wrapper.unmount()
    mounted = null
    restoreStubs()
  })

  async function ready(manyArmors = 0): Promise<Mounted> {
    const bundle = makeBundle()
    const dictionary = makeDictionary()
    const template = bundle.armors[0] as MasterArmor
    for (let i = 0; i < manyArmors; i += 1) {
      const id = `ar:many:${i}` as ArmorId
      bundle.armors.push({ ...template, id })
      dictionary.entries[id] = { name: `試作防具${i}` }
    }
    stubBackend({ bundle, dictionary })
    mounted = await mountReadyApp()
    return mounted
  }

  const search = () => document.getElementById('exclude-search') as HTMLInputElement
  const options = () => Array.from(document.querySelectorAll('[role="option"]'))
  const optionTexts = () => options().map((o) => textOf(o))
  const h3s = () => Array.from(document.querySelectorAll('h3')).map((h) => textOf(h))

  async function typeQuery(term: string): Promise<void> {
    search().focus()
    await typeInto(search(), term)
    await vi.waitFor(() => expect(document.querySelector('[role="listbox"]')).not.toBeNull())
  }

  async function pick(name: string): Promise<void> {
    const option = options().find((o) => textOf(o).startsWith(name))
    if (option === undefined) throw new Error(`候補「${name}」がありません`)
    option.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await flushPromises()
    await vi.waitFor(() => expect(options()).toHaveLength(0))
  }

  it(
    'AC-5: 見出し・補助文・探す欄を出し、空のときは文言を出し、入力が空なら候補を開かない',
    async () => {
      await ready()
      expect(Array.from(document.querySelectorAll('h2')).map((h) => textOf(h))).toContain('除外')
      expect(textOf(document.body)).toContain('除外した防具・装飾品は、検索の候補にしません。')
      expect(document.querySelector('label[for="exclude-search"]')?.textContent?.trim()).toBe(
        '防具・装飾品を探す',
      )
      expect(search().placeholder).toBe('名前の一部を入力')
      expect(textOf(document.body)).toContain('除外している防具・装飾品はありません。')
      search().focus()
      search().dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()
      expect(options()).toHaveLength(0)
    },
    SLOW,
  )

  it(
    'AC-5: 候補は件数・防具→装飾品の群・補助の文言つきで出る',
    async () => {
      await ready()
      await typeQuery('攻撃')
      expect(textOf(document.body)).toContain('「攻撃」を含む防具・装飾品: 1 件')
      expect(optionTexts()).toEqual(['攻撃珠【２】防具用 Lv2'])
      await typeInto(search(), '頭')
      await vi.waitFor(() =>
        expect(optionTexts()).toEqual(['上位の頭頭・上位', '下位の頭頭・下位']),
      )
    },
    SLOW,
  )

  it(
    'AC-5: 0 件のときは文言を出す',
    async () => {
      await ready()
      await typeQuery('ほげほげ')
      expect(textOf(document.body)).toContain(
        '該当する防具・装飾品がありません。名前を変えてください。',
      )
    },
    SLOW,
  )

  it(
    'AC-5: 候補は 50 件で打ち切り、残りの件数を出す',
    async () => {
      await ready(60)
      await typeQuery('試作防具')
      expect(options()).toHaveLength(50)
      expect(textOf(document.body)).toContain('「試作防具」を含む防具・装飾品: 60 件')
      expect(textOf(document.body)).toContain('ほかに 10 件あります。名前を絞り込んでください。')
    },
    SLOW,
  )

  it(
    'AC-5: 選ぶと一覧の群に足し、入力欄を空にして閉じ、フォーカスを残す。除外済みは候補に出ない',
    async () => {
      const m = await ready()
      const store = useLockExcludeStore(m.pinia)
      await typeQuery('頭')
      await pick('下位の頭')
      expect(store.excludedArmorIds).toEqual([armorId('low', 'head')])
      expect(search().value).toBe('')
      expect(document.activeElement).toBe(search())
      expect(h3s()).toEqual(['防具（1 件）'])
      expect(textOf(document.body)).not.toContain('除外している防具・装飾品はありません。')

      await typeQuery('攻撃')
      await pick('攻撃珠')
      expect(store.excludedDecorationIds).toEqual([dc('1')])
      expect(h3s()).toEqual(['防具（1 件）', '装飾品（1 件）'])

      await typeQuery('頭')
      expect(optionTexts()).toEqual(['上位の頭頭・上位'])
    },
    SLOW,
  )

  it(
    'AC-5: 外すボタンの aria-label は「<名前>を除外から外す」で、押すと一覧から消える',
    async () => {
      const m = await ready()
      const store = useLockExcludeStore(m.pinia)
      store.addExcludedArmor(armorId('low', 'head'))
      await flushPromises()
      await click(findByLabel('下位の頭を除外から外す'))
      expect(store.excludedArmorIds).toEqual([])
      expect(textOf(document.body)).toContain('除外している防具・装飾品はありません。')
    },
    SLOW,
  )

  it(
    'AC-5: 外した後のフォーカスは次の行、無ければ前の行、どちらも無ければ探す欄',
    async () => {
      const m = await ready()
      const store = useLockExcludeStore(m.pinia)
      store.addExcludedArmor(armorId('low', 'head'))
      store.addExcludedArmor(armorId('low', 'chest'))
      store.addExcludedArmor(armorId('low', 'arms'))
      await flushPromises()
      await click(findByLabel('下位の胴を除外から外す'))
      expect(document.activeElement).toBe(findByLabel('下位の腕を除外から外す'))
      await click(findByLabel('下位の腕を除外から外す'))
      expect(document.activeElement).toBe(findByLabel('下位の頭を除外から外す'))
      await click(findByLabel('下位の頭を除外から外す'))
      expect(document.activeElement).toBe(search())
    },
    SLOW,
  )

  it(
    'AC-7: 固定している防具を除外に足すと、その部位の固定が外れてトーストが出る',
    async () => {
      const m = await ready()
      const store = useLockExcludeStore(m.pinia)
      store.setFixed('head', armorId('low', 'head'))
      await typeQuery('下位の頭')
      await pick('下位の頭')
      expect('head' in store.fixed).toBe(false)
      expect(textOf(document.body)).toContain('頭の固定を解除しました。')
      expect((document.getElementById('armor-lock-head') as HTMLInputElement).value).toBe(
        '固定しない',
      )
    },
    SLOW,
  )

  it(
    'AC-8: 検索の前に、固定した部位と除外した防具・装飾品を画面で確かめられる',
    async () => {
      const m = await ready()
      const store = useLockExcludeStore(m.pinia)
      store.setFixed('waist', null)
      store.addExcludedArmor(armorId('high', 'legs'))
      store.addExcludedDecoration(dc('1'))
      await flushPromises()
      expect((document.getElementById('armor-lock-waist') as HTMLInputElement).value).toBe(
        '何も付けない',
      )
      expect(h3s()).toEqual(['防具（1 件）', '装飾品（1 件）'])
      expect(textOf(document.body)).toContain('上位の脚')
    },
    SLOW,
  )

  it(
    'AC-5: Combobox の Enter では検索フォームを送信しない',
    async () => {
      const m = await ready()
      const submit = vi.spyOn(m.search, 'submit')
      await typeQuery('頭')
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      search().dispatchEvent(event)
      await flushPromises()
      expect(event.defaultPrevented).toBe(true)
      expect(submit).not.toHaveBeenCalled()
    },
    SLOW,
  )
})
