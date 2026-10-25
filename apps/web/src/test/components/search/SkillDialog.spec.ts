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

// 受入基準 2（必須スキルのダイアログ。追加・削除・種類ごとのまとまりは 004 の振る舞い）
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

  // 受入基準 2（D2: 読みでの検索）
  it('読み（ひらがな・カタカナ・半角）でも一致する。読みが無いスキルは名前だけで照らす', async () => {
    await open()
    await setQuery('こうげき')
    expect(skillNames()).toEqual(['攻撃'])
    await setQuery('コウゲキ')
    expect(skillNames()).toEqual(['攻撃'])
    await setQuery('ｺｳｹﾞｷ')
    expect(skillNames()).toEqual(['攻撃'])
    await setQuery('がーど')
    expect(skillNames()).toEqual(['ガード'])
    // 「火竜の力」は読みが無いので、読みの語では出ない。名前では出る
    await setQuery('かりゅう')
    expect(skillNames()).toEqual([])
    await setQuery('火竜')
    expect(skillNames()).toEqual(['火竜の力'])
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

  // 受入基準 8・9・10（D2 の格子の列数と、説明の開閉）
  describe('説明の開閉', () => {
    const infoButton = (name: string) =>
      dialog()!.querySelector<HTMLButtonElement>(`button[aria-label="${name}の説明"]`)!
    const region = (name: string) =>
      dialog()!.querySelector<HTMLElement>(`section[aria-label="${name}の説明"]`)

    it('[基準8] 格子の列数は基準 1・md 2・lg 3', async () => {
      await open()
      const grid = dialog()!.querySelector('ul.grid')!
      expect(grid.classList.contains('grid-cols-1')).toBe(true)
      expect(grid.classList.contains('md:grid-cols-2')).toBe(true)
      expect(grid.classList.contains('lg:grid-cols-3')).toBe(true)
    })

    it('[基準8] 各スキルの右に説明の開閉ボタンを置く（既定は閉じ）', async () => {
      await open()
      const button = infoButton('剛刃')
      expect(button.getAttribute('aria-expanded')).toBe('false')
      expect(region('剛刃')).toBeNull()
      expect(button.previousElementSibling?.getAttribute('aria-pressed')).toBe('false')
    })

    it('[基準8・9・10] 開くとレベルごとの説明文と補完を出す。説明文も効果も無いレベルは出さない', async () => {
      await open()
      await selectTab('防具')
      const button = infoButton('攻撃')
      await click(button)
      expect(button.getAttribute('aria-expanded')).toBe('true')
      const area = region('攻撃')!
      expect(button.getAttribute('aria-controls')).toBe(area.id)
      expect(textOf(area.querySelector('p'))).toBe('攻撃（最大 Lv3）')
      const rows = Array.from(area.querySelectorAll('dl > div')).map((row) => [
        textOf(row.querySelector('dt')),
        ...Array.from(row.querySelectorAll('dd p')).map((p) => p.textContent ?? ''),
      ])
      expect(rows).toEqual([
        ['Lv1', '攻撃力が少し上がる。', '効果: 攻撃力 +3'],
        ['Lv2', '攻撃力が上がる。', '効果: 攻撃力 +6'],
        [
          'Lv3',
          '攻撃力が大きく上がる。\n会心率も上がる。',
          '効果: 攻撃力 ×1.04・攻撃力 +9 ／ 会心率 +20%（有効部位への攻撃）',
        ],
      ])
      await click(button)
      expect(region('攻撃')).toBeNull()
    })

    it('[基準10] 説明文が無いレベルは補完だけ、どちらも無いレベルは行ごと出さない', async () => {
      await open()
      await click(infoButton('剛刃'))
      const rows = Array.from(region('剛刃')!.querySelectorAll('dl > div')).map((row) =>
        textOf(row),
      )
      // Lv1（説明文が空・効果なし）は出ない。Lv2 は説明文だけ、Lv5 は補完だけ
      expect(rows).toEqual(['Lv2武器の切れ味が増す。', 'Lv5効果: 攻撃力 +10'])
    })

    it('[基準8] 説明も効果も無いスキルは「説明はありません」を出す', async () => {
      await open()
      await selectTab('シリーズ')
      await click(infoButton('火竜の力'))
      expect(textOf(region('火竜の力'))).toContain('このスキルの説明はありません。')
    })

    it('[基準8] 開くのは1つだけで、タブの切り替え・検索語の変更・ダイアログを閉じたときに閉じる', async () => {
      await open()
      await click(infoButton('剛刃'))
      expect(region('剛刃')).not.toBeNull()
      await selectTab('防具')
      expect(dialog()!.querySelector('section[aria-label]')).toBeNull()
      await click(infoButton('攻撃'))
      await click(infoButton('ガード'))
      expect(dialog()!.querySelectorAll('section[aria-label]')).toHaveLength(1)
      expect(region('ガード')).not.toBeNull()
      await setQuery('攻')
      expect(dialog()!.querySelector('section[aria-label]')).toBeNull()
      await click(infoButton('攻撃'))
      expect(region('攻撃')).not.toBeNull()
      await click(findButton('閉じる', dialog()!))
      await vi.waitFor(() => expect(dialog()).toBeNull())
      await click(findButton('スキルを選ぶ'))
      expect(dialog()!.querySelector('section[aria-label]')).toBeNull()
    })
  })

  it('「閉じる」で閉じても、選択は取り消さない', async () => {
    const m = await open()
    await click(skillButtons()[0])
    await click(findButton('閉じる', dialog()!))
    await vi.waitFor(() => expect(dialog()).toBeNull())
    expect(m.conditions.required).toHaveLength(1)
  })
})
