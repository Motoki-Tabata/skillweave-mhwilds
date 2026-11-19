import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
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

// 受入基準 5（目的・件数・ランク）、007 受入基準 1（火力の最大化の選択肢）
describe('ConditionsCard', () => {
  let mounted: Mounted | null = null

  beforeAll(installDomPolyfills)
  afterEach(() => {
    mounted?.wrapper.unmount()
    mounted = null
    restoreStubs()
  })

  async function ready(options: Parameters<typeof stubBackend>[0] = {}): Promise<Mounted> {
    stubBackend(options)
    mounted = await mountReadyApp()
    return mounted
  }

  const countInput = () => document.querySelector<HTMLInputElement>('input[inputmode="numeric"]')!
  const radio = (id: string) => document.getElementById(`objective-${id}`)!
  const rankBox = (id: string) => document.getElementById(`rank-${id}`)!

  // NumberField の増減ボタンは click でなく pointerdown（マウスは即時に1回）で動く
  async function press(button: HTMLElement): Promise<void> {
    const init = { pointerId: 1, pointerType: 'mouse', button: 0, bubbles: true, cancelable: true }
    button.dispatchEvent(new PointerEvent('pointerdown', init))
    window.dispatchEvent(new PointerEvent('pointerup', init))
    await flushPromises()
  }

  async function typeCount(value: string): Promise<void> {
    const input = countInput()
    input.focus()
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.blur()
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
  }

  describe('目的', () => {
    it('4つの選択肢と補助文を出し、既定は「条件を満たす構成」', async () => {
      await ready()
      const body = textOf(document.body)
      for (const text of [
        '条件を満たす構成',
        '必須スキルを満たす構成を探します。',
        '防御力の最大化',
        '防具の防御力の合計が大きい順に探します。',
        '空きスロットの最大化',
        '空きスロットが多い順に探します。',
        '火力の最大化',
        '物理の期待値が大きい順に探します。「発動条件」でオンにした効果を数えます。',
      ]) {
        expect(body).toContain(text)
      }
      expect(radio('feasible').getAttribute('aria-checked')).toBe('true')
      expect(radio('defense').getAttribute('aria-checked')).toBe('false')
      expect(document.querySelector('[role="radiogroup"]')?.getAttribute('aria-labelledby')).toBe(
        'objective-label',
      )
    })

    it('選ぶと目的が変わる', async () => {
      const { conditions } = await ready()
      await click(radio('freeSlots'))
      expect(conditions.objective).toBe('freeSlots')
      expect(radio('freeSlots').getAttribute('aria-checked')).toBe('true')
    })
  })

  // 023 AC-9（属性の最大化を選べないときの理由・無効・エラー）
  describe('属性の最大化', () => {
    const NO_ELEMENT =
      '選んだ武器（無属性）では選べません。火・水・雷・氷・龍属性の武器で選べます。'
    const ERROR =
      '選んだ武器（無属性）では、属性の最大化で探せません。目的を選び直すか、火・水・雷・氷・龍属性の武器を選んでください。'

    async function readyWithElements(): Promise<Mounted> {
      const base = makeBundle()
      return ready({
        bundle: {
          ...base,
          weapons: base.weapons.map((w) =>
            w.id === wp('great-sword:1') ? { ...w, element: { type: 'fire', value: 30 } } : w,
          ),
        },
        dictionary: makeDictionary(),
      })
    }

    it('選択肢と補助文を出す。5 属性の武器では選べて、理由は出さない', async () => {
      const { conditions } = await readyWithElements()
      conditions.selectWeapon(wp('great-sword:1'))
      await flushPromises()
      expect(textOf(document.body)).toContain('属性の最大化')
      expect(textOf(document.body)).toContain(
        '属性期待値が大きい順に探します。「発動条件」でオンにした効果を数えます。',
      )
      expect(radio('expectedElement').hasAttribute('disabled')).toBe(false)
      expect(textOf(document.body)).not.toContain('では選べません')
    })

    it('無属性の武器では選べなくし、理由を補助文と並べて aria-describedby に結ぶ', async () => {
      const { conditions } = await readyWithElements()
      conditions.selectWeapon(wp('long-sword:1'))
      await flushPromises()
      expect(radio('expectedElement').hasAttribute('disabled')).toBe(true)
      expect(textOf(document.getElementById('objective-expectedElement-reason'))).toBe(NO_ELEMENT)
      expect(radio('expectedElement').getAttribute('aria-describedby')).toBe(
        'objective-expectedElement-description objective-expectedElement-reason',
      )
    })

    it('選んだ後に選べない武器にすると、選択を無効にせずエラーを目的の直下に出し、理由は出さない', async () => {
      const { conditions } = await readyWithElements()
      conditions.selectWeapon(wp('great-sword:1'))
      await click(radio('expectedElement'))
      conditions.selectWeapon(wp('long-sword:1'))
      await flushPromises()
      expect(radio('expectedElement').getAttribute('aria-checked')).toBe('true')
      expect(radio('expectedElement').hasAttribute('disabled')).toBe(false)
      expect(textOf(document.getElementById('objective-error'))).toBe(ERROR)
      expect(document.querySelector('[role="radiogroup"]')?.getAttribute('aria-describedby')).toBe(
        'objective-error',
      )
      expect(document.getElementById('objective-expectedElement-reason')).toBeNull()
      // 目的を選び直すとエラーが消える
      await click(radio('feasible'))
      expect(document.getElementById('objective-error')).toBeNull()
    })
  })

  describe('件数', () => {
    it('既定は 10 で、「1〜30 件」の補助文を出す', async () => {
      await ready()
      expect(countInput().value).toBe('10')
      expect(textOf(document.body)).toContain('1〜30 件')
    })

    it('範囲外の値はフォーカスを外したときに範囲へ丸める', async () => {
      const { conditions } = await ready()
      await typeCount('99')
      expect(conditions.maxResults).toBe(30)
      expect(countInput().value).toBe('30')
      await typeCount('0')
      expect(conditions.maxResults).toBe(1)
      expect(countInput().value).toBe('1')
    })

    it('空欄は直前の値に戻す', async () => {
      const { conditions } = await ready()
      await typeCount('7')
      expect(conditions.maxResults).toBe(7)
      await typeCount('')
      await vi.waitFor(() => expect(countInput().value).toBe('7'))
      expect(conditions.maxResults).toBe(7)
    })

    it('「−」「＋」で増減し、範囲の端で無効になる', async () => {
      const { conditions } = await ready()
      await press(findByLabel('件数を増やす'))
      expect(conditions.maxResults).toBe(11)
      await press(findByLabel('件数を減らす'))
      await press(findByLabel('件数を減らす'))
      expect(conditions.maxResults).toBe(9)
      conditions.setMaxResults(30)
      await flushPromises()
      expect(findByLabel('件数を増やす').hasAttribute('disabled')).toBe(true)
      conditions.setMaxResults(1)
      await flushPromises()
      expect(findByLabel('件数を減らす').hasAttribute('disabled')).toBe(true)
    })
  })

  describe('候補にするランク', () => {
    it('マスターに含まれるランクだけを出し、既定は最も高いランクだけ（現行は上位）', async () => {
      await ready()
      expect(textOf(document.querySelector('label[for="rank-low"]'))).toBe('下位')
      expect(textOf(document.querySelector('label[for="rank-high"]'))).toBe('上位')
      expect(document.getElementById('rank-master')).toBeNull()
      expect(rankBox('low').getAttribute('aria-checked')).toBe('false')
      expect(rankBox('high').getAttribute('aria-checked')).toBe('true')
    })

    it('マスターランクの防具が入ったら「マスター」も出し、既定はそれだけ', async () => {
      const options = { ranks: ['low', 'high', 'master'] as ('low' | 'high' | 'master')[] }
      await ready({ bundle: makeBundle(options), dictionary: makeDictionary(options) })
      expect(textOf(document.querySelector('label[for="rank-master"]'))).toBe('マスター')
      expect(rankBox('master').getAttribute('aria-checked')).toBe('true')
      expect(rankBox('high').getAttribute('aria-checked')).toBe('false')
    })

    it('チェックを変えると即座に反映する', async () => {
      const { conditions } = await ready()
      await click(rankBox('low'))
      expect(conditions.ranks).toEqual(['low', 'high'])
    })

    it('0個にすると、直下にエラーを出す（ランクが選ばれたら消える）', async () => {
      await ready()
      await click(rankBox('high'))
      const error = document.getElementById('rank-error')
      expect(textOf(error)).toBe('候補にするランクを1つ以上選んでください。')
      expect(document.querySelector('fieldset')?.getAttribute('aria-describedby')).toBe(
        'rank-error',
      )
      await click(rankBox('low'))
      expect(document.getElementById('rank-error')).toBeNull()
    })
  })
})
