import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { useLockExcludeStore } from '@/stores/lockExclude'
import { armorId } from '../../support/fixtures'
import {
  installDomPolyfills,
  mountReadyApp,
  restoreStubs,
  stubBackend,
  textOf,
  typeInto,
} from '../../support/mount'
import type { Mounted } from '../../support/mount'

const SLOW = 15000

// 020 受入基準 AC-3（部位の固定の入力）・AC-4（全ランクの候補）
describe('ArmorLockCard', () => {
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

  const input = (part: string) => document.getElementById(`armor-lock-${part}`) as HTMLInputElement
  const options = () => Array.from(document.querySelectorAll('[role="option"]'))
  const optionTexts = () => options().map((o) => textOf(o))

  async function open(part: string): Promise<void> {
    const el = input(part)
    el.focus()
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(options().length).toBeGreaterThan(0))
  }

  async function choose(label: string): Promise<void> {
    const option = options().find((o) => textOf(o) === label)
    if (option === undefined) throw new Error(`候補「${label}」がありません`)
    option.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(options()).toHaveLength(0))
    await flushPromises()
  }

  it(
    'AC-3: 見出しと補助文があり、5 部位の入力欄が頭・胴・腕・腰・脚の順で、既定は「固定しない」',
    async () => {
      await ready()
      const heading = Array.from(document.querySelectorAll('h2')).find(
        (h) => textOf(h) === '部位の固定',
      )
      expect(heading).toBeTruthy()
      expect(textOf(document.body)).toContain(
        '固定した防具は、候補にするランクにかかわらず使います。',
      )
      const fieldset = document.querySelector('fieldset[aria-labelledby="armor-lock-heading"]')!
      expect(document.getElementById(fieldset.getAttribute('aria-labelledby')!)).toBe(heading)
      const inputs = Array.from(fieldset.querySelectorAll('input')) as HTMLInputElement[]
      expect(inputs.map((i) => i.id)).toEqual([
        'armor-lock-head',
        'armor-lock-chest',
        'armor-lock-arms',
        'armor-lock-waist',
        'armor-lock-legs',
      ])
      expect(inputs.map((i) => i.value)).toEqual(Array(5).fill('固定しない'))
      expect(document.querySelector('label[for="armor-lock-head"]')?.textContent?.trim()).toBe('頭')
    },
    SLOW,
  )

  it(
    'AC-4: 候補の先頭は「固定しない」「何も付けない」で、その部位の全ランクの防具が上位→下位の順に並ぶ',
    async () => {
      await ready()
      await open('head')
      expect(optionTexts()).toEqual(['固定しない', '何も付けない', '上位の頭', '下位の頭'])
      const headings = Array.from(document.querySelectorAll('[data-slot="combobox-group"]')).map(
        (g) => textOf(g.firstElementChild),
      )
      expect(headings).toEqual(['上位', '下位'])
    },
    SLOW,
  )

  it(
    'AC-4: 絞り込んでも「固定しない」「何も付けない」は常に先頭にあり、件数を出す',
    async () => {
      await ready()
      await open('head')
      await typeInto(input('head'), '上位')
      await vi.waitFor(() =>
        expect(optionTexts()).toEqual(['固定しない', '何も付けない', '上位の頭']),
      )
      expect(textOf(document.body)).toContain('「上位」を含む防具: 1 件')
    },
    SLOW,
  )

  it(
    'AC-3: 0 件の絞り込みでは文言を出す',
    async () => {
      await ready()
      await open('head')
      await typeInto(input('head'), 'ほげほげ')
      await vi.waitFor(() =>
        expect(textOf(document.body)).toContain('該当する防具がありません。名前を変えてください。'),
      )
      expect(optionTexts()).toEqual(['固定しない', '何も付けない'])
    },
    SLOW,
  )

  it(
    'AC-3: 防具を選ぶとストアに入り、入力欄に名前が出る。「何も付けない」は null、「固定しない」で戻る',
    async () => {
      const m = await ready()
      const store = useLockExcludeStore(m.pinia)
      await open('head')
      await choose('下位の頭')
      expect(store.fixed.head).toBe(armorId('low', 'head'))
      expect(input('head').value).toBe('下位の頭')

      await open('chest')
      await choose('何も付けない')
      expect(store.fixed.chest).toBeNull()
      expect(input('chest').value).toBe('何も付けない')

      await open('head')
      await choose('固定しない')
      expect('head' in store.fixed).toBe(false)
      expect(input('head').value).toBe('固定しない')
    },
    SLOW,
  )

  it(
    'AC-3: 入力したまま選ばずにフォーカスを外すと、選んでいる値の表示名に戻る',
    async () => {
      await ready()
      await open('legs')
      await typeInto(input('legs'), '上位')
      input('legs').dispatchEvent(new FocusEvent('blur'))
      await flushPromises()
      expect(input('legs').value).toBe('固定しない')
    },
    SLOW,
  )

  it(
    'AC-3: Combobox の Enter では検索フォームを送信しない',
    async () => {
      const m = await ready()
      const submit = vi.spyOn(m.search, 'submit')
      await open('head')
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      input('head').dispatchEvent(event)
      await flushPromises()
      expect(event.defaultPrevented).toBe(true)
      expect(submit).not.toHaveBeenCalled()
    },
    SLOW,
  )
})
