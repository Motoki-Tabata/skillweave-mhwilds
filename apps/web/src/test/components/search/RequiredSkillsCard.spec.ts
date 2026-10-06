import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { sk } from '../../support/fixtures'
import {
  click,
  findButton,
  findByLabel,
  installDomPolyfills,
  mountReadyApp,
  restoreStubs,
  stubBackend,
  textOf,
} from '../../support/mount'
import type { Mounted } from '../../support/mount'

// 受入基準 4（必須スキルの行・下限の範囲・削除）
describe('RequiredSkillsCard', () => {
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

  it('必須スキルが無いときは案内を出す（追加しなくても検索できる旨）', async () => {
    await ready()
    expect(textOf(document.body)).toContain(
      '必須スキルが選ばれていません。「スキルを選ぶ」から追加してください（追加しなくても検索できます）。',
    )
    expect(findButton('スキルを選ぶ').getAttribute('aria-haspopup')).toBe('dialog')
  })

  it('スキルを種類ごとの小見出しの下にまとめ、該当の無い種類は小見出しごと出さない', async () => {
    const { conditions } = await ready()
    for (const id of ['s1', 'a2', 'a1']) conditions.toggleSkill(sk(id))
    await flushPromises()
    const headings = Array.from(document.querySelectorAll('section h3')).map((h) => textOf(h))
    expect(headings).toEqual(['防具', 'シリーズ'])
    expect(document.body.textContent).not.toContain('必須スキルが選ばれていません')
    const armorRows = Array.from(
      document.querySelectorAll('section')[0].querySelectorAll('li'),
    ).map((li) => textOf(li.querySelector('span')))
    expect(armorRows).toEqual(['ガード', '攻撃'])
  })

  it('各行に「<スキル名>の下限レベル」の Select（既定は最大レベル）と削除ボタンがある', async () => {
    const { conditions } = await ready()
    conditions.toggleSkill(sk('a2'))
    await flushPromises()
    const trigger = findByLabel('ガードの下限レベル', document.body)
    expect(textOf(trigger)).toBe('Lv4')
    expect(findByLabel('ガードを削除').tagName).toBe('BUTTON')
  })

  it('下限の選択肢は Lv1〜最大レベルで、選ぶと下限が変わる', async () => {
    const { conditions } = await ready()
    conditions.toggleSkill(sk('a2'))
    await flushPromises()
    const trigger = findByLabel('ガードの下限レベル') as HTMLElement
    trigger.focus()
    trigger.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )
    await vi.waitFor(() =>
      expect(document.querySelectorAll('[role="option"]').length).toBeGreaterThan(0),
    )
    const options = Array.from(document.querySelectorAll('[role="option"]'))
    expect(options.map((o) => textOf(o))).toEqual(['Lv1', 'Lv2', 'Lv3', 'Lv4'])
    options[1].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )
    await vi.waitFor(() => expect(conditions.required[0].level).toBe(2))
  }, 20000)

  it('削除すると、フォーカスを次の行の削除ボタンへ移す', async () => {
    const { conditions } = await ready()
    conditions.toggleSkill(sk('a2'))
    conditions.toggleSkill(sk('a1'))
    await flushPromises()
    await click(findByLabel('ガードを削除'))
    await flushPromises()
    expect(conditions.required.map((r) => r.skillId)).toEqual([sk('a1')])
    expect(document.activeElement).toBe(findByLabel('攻撃を削除'))
  })

  it('最後の行を削除すると、フォーカスを「スキルを選ぶ」ボタンへ移す', async () => {
    const { conditions } = await ready()
    conditions.toggleSkill(sk('a1'))
    await flushPromises()
    await click(findByLabel('攻撃を削除'))
    await flushPromises()
    expect(conditions.required).toEqual([])
    expect(document.activeElement).toBe(findButton('スキルを選ぶ'))
  })
})
