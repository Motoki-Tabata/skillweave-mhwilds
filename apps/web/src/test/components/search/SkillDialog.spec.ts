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

// 受入基準 4（必須スキルの追加・削除・種類ごとのまとまり）
describe('SkillDialog（D2）', () => {
  let mounted: Mounted | null = null

  beforeAll(installDomPolyfills)
  afterEach(() => {
    mounted?.wrapper.unmount()
    mounted = null
    restoreStubs()
  })

  const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')
  const skillButtons = () => Array.from(dialog()?.querySelectorAll('ul button[aria-pressed]') ?? [])
  const skillNames = () => skillButtons().map((b) => textOf(b.querySelector('span')))
  const tabs = () => Array.from(dialog()?.querySelectorAll('[role="tab"]') ?? [])

  async function open(): Promise<Mounted> {
    stubBackend()
    mounted = await mountReadyApp()
    await click(findButton('スキルを選ぶ'))
    expect(dialog()).not.toBeNull()
    return mounted
  }

  async function selectTab(label: string): Promise<void> {
    const tab = tabs().find((t) => textOf(t) === label)!
    tab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }))
    await flushPromises()
  }

  async function setQuery(value: string): Promise<void> {
    const input = findByLabel('スキル名で検索') as HTMLInputElement
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
  }

  it('見出し・説明・種類のタブ（武器・防具・シリーズ・グループの順。既定は武器）を出す', async () => {
    await open()
    expect(textOf(dialog()!.querySelector('h2'))).toBe('スキルを選ぶ')
    expect(textOf(dialog())).toContain(
      '押すと必須スキルに追加し、もう一度押すと外します。下限は最大レベルで追加し、後から変えられます。',
    )
    expect(findByLabel('スキルの種類').getAttribute('role')).toBe('tablist')
    expect(tabs().map((t) => textOf(t))).toEqual(['武器', '防具', 'シリーズ', 'グループ'])
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true')
    expect(skillNames()).toEqual(['剛刃'])
  })

  it('タブの中は名前の五十音順', async () => {
    await open()
    await selectTab('防具')
    expect(skillNames()).toEqual(['ガード', '攻撃'])
    await selectTab('シリーズ')
    expect(skillNames()).toEqual(['火竜の力'])
    await selectTab('グループ')
    expect(skillNames()).toEqual(['不屈の極み'])
  })

  it('押すと下限を最大レベルで追加し（選択中・aria-pressed）、もう一度押すと外す', async () => {
    const m = await open()
    await selectTab('防具')
    await click(skillButtons()[0])
    expect(m.conditions.required).toEqual([{ skillId: sk('a2'), level: 4 }])
    expect(skillButtons()[0].getAttribute('aria-pressed')).toBe('true')
    expect(textOf(skillButtons()[0])).toContain('選択中')
    expect(textOf(skillButtons()[1])).not.toContain('選択中')
    await click(skillButtons()[0])
    expect(m.conditions.required).toEqual([])
    expect(skillButtons()[0].getAttribute('aria-pressed')).toBe('false')
  })

  it('名前で検索すると、タブを隠し、すべての種類から部分一致で絞り込み、種類名を出す', async () => {
    await open()
    await setQuery('攻')
    expect(tabs()).toHaveLength(0)
    expect(textOf(dialog())).toContain('「攻」を含むスキル（すべての種類）: 1 件')
    expect(skillNames()).toEqual(['攻撃'])
    expect(textOf(skillButtons()[0])).toContain('防具')
    await setQuery('の')
    // 火竜の力（シリーズ）・不屈の極み（グループ）。種類の順
    expect(skillNames()).toEqual(['火竜の力', '不屈の極み'])
    await setQuery('')
    expect(tabs()).toHaveLength(4)
  })

  it('検索結果が0件のときは案内を出す', async () => {
    await open()
    await setQuery('存在しない')
    expect(skillButtons()).toHaveLength(0)
    expect(textOf(dialog())).toContain('「存在しない」を含むスキル（すべての種類）: 0 件')
    expect(textOf(dialog())).toContain('該当するスキルがありません。名前を変えてください。')
  })

  it('フッターに選択中の件数と、種類ごとの行にまとめたスキル名を出す', async () => {
    await open()
    await setQuery('')
    await click(skillButtons()[0]) // 剛刃（武器）
    await selectTab('シリーズ')
    await click(skillButtons()[0]) // 火竜の力
    await selectTab('防具')
    await click(skillButtons()[1]) // 攻撃
    await click(skillButtons()[0]) // ガード
    const footer = dialog()!.querySelector('h3')!.parentElement!
    expect(textOf(footer.querySelector('h3'))).toBe('選択中のスキル（4）')
    const rows = Array.from(footer.querySelectorAll(':scope > div:has(ul)')).map((row) => [
      textOf(row.querySelector('span')),
      ...Array.from(row.querySelectorAll('li')).map((li) => textOf(li)),
    ])
    expect(rows).toEqual([
      ['武器', '剛刃'],
      ['防具', '攻撃', 'ガード'],
      ['シリーズ', '火竜の力'],
    ])
  })

  it('「閉じる」で閉じても、選択は取り消さない', async () => {
    const m = await open()
    await click(skillButtons()[0])
    await click(findButton('閉じる', dialog()!))
    await vi.waitFor(() => expect(dialog()).toBeNull())
    expect(m.conditions.required).toHaveLength(1)
  })
})
