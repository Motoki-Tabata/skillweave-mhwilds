import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { LOADING_SKELETON_DELAY_MS } from '@/constants/search'
import type { CharmPayload } from '@/lib/charms/types'
import { useToastStore } from '@/stores/toast'
import { createMemoryCharmRepository } from '../support/charmRepository'
import { charmId, storedCharm } from '../support/charms'
import { makeTableBundle, sk } from '../support/fixtures'
import {
  click,
  findButton,
  findByLabel,
  installDomPolyfills,
  mountApp,
  mountReadyApp,
  restoreStubs,
  stubBackend,
  textOf,
} from '../support/mount'
import type { Mounted } from '../support/mount'
import type { MemoryCharmRepository } from '../support/charmRepository'

const body = () => textOf(document.body)
const SLOW = 20000

const passing: CharmPayload = {
  rarity: 8,
  skills: [{ skillId: sk('a1'), level: 2 }],
  slots: [{ target: 'weapon', level: 1 }],
}
const mismatching: CharmPayload = { ...passing, skills: [{ skillId: sk('a1'), level: 3 }] }
const unchecked: CharmPayload = { rarity: 6, skills: [{ skillId: sk('a2'), level: 4 }], slots: [] }
const overLevel: CharmPayload = { ...passing, skills: [{ skillId: sk('a1'), level: 9 }] }

describe('CharmsView（S2・D3）', () => {
  let mounted: Mounted | null = null

  beforeAll(installDomPolyfills)
  afterEach(() => {
    mounted?.wrapper.unmount()
    mounted = null
    vi.useRealTimers()
    restoreStubs()
    document.body.innerHTML = ''
  })

  async function ready(repository?: MemoryCharmRepository): Promise<Mounted> {
    stubBackend({ bundle: makeTableBundle() })
    mounted = await mountReadyApp({ path: '/charms', charmRepository: repository })
    await vi.waitFor(() => expect(mounted!.charms.status).not.toBe('loading'))
    await flushPromises()
    return mounted
  }

  const radio = (value: number) =>
    document.querySelector<HTMLElement>(`[role="radio"][value="${value}"]`)!
  const skillInput = (row: number) =>
    document.getElementById(`charm-skill-${row}`) as HTMLInputElement
  const rows = () => Array.from(document.querySelectorAll<HTMLElement>('[data-charm-id]'))
  const options = () => Array.from(document.querySelectorAll('[role="option"]'))

  async function openSelect(trigger: HTMLElement): Promise<void> {
    trigger.focus()
    trigger.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )
    await vi.waitFor(() => expect(options().length).toBeGreaterThan(0))
  }

  async function chooseOption(trigger: HTMLElement, label: string): Promise<void> {
    await openSelect(trigger)
    const option = options().find((o) => textOf(o) === label)
    if (option === undefined) throw new Error(`選択肢「${label}」がありません`)
    option.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )
    await vi.waitFor(() => expect(options()).toHaveLength(0))
    await flushPromises()
  }

  async function type(row: number, term: string): Promise<void> {
    const input = skillInput(row)
    input.focus()
    input.value = term
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.waitFor(() => expect(options().length).toBeGreaterThan(0))
  }

  async function pickSkill(row: number, term: string, name: string, level?: number): Promise<void> {
    await type(row, term)
    const option = options().find((o) => textOf(o).startsWith(name))
    if (option === undefined) throw new Error(`候補「${name}」がありません`)
    option.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(skillInput(row).value).toBe(name))
    await flushPromises()
    if (level !== undefined) {
      await chooseOption(findByLabel(`スキル${row}のレベル`), `Lv${level}`)
    }
  }

  const submit = () => click(findButton('登録'))

  // 受入基準 1（入力して登録）・3（端末に保存し、再読み込みの後も残る）
  describe('登録', () => {
    // 受入基準 1（レア度の各選択肢がラベルで名前を持つ）
    it('レア度の各選択肢は、ラベルの数字をアクセシブルネームに持つ', async () => {
      await ready()
      for (const value of [5, 6, 7, 8]) {
        const item = radio(value)
        expect(item.id).toBe(`charm-rarity-${value}`)
        expect(document.querySelector(`label[for="${item.id}"]`)?.textContent?.trim()).toBe(
          String(value),
        )
      }
    })

    it(
      'レア度・スキル・レベル・スロットを入力して登録すると、端末に保存し一覧に出す',
      async () => {
        const m = await ready()
        await click(radio(8))
        await pickSkill(1, '攻撃', '攻撃', 2)
        await chooseOption(document.getElementById('charm-slot-1')!, '武器用 Lv1')
        await submit()
        await vi.waitFor(() => expect(m.charms.charms).toHaveLength(1))
        const saved = (m.repository as MemoryCharmRepository).snapshot()
        expect(saved).toHaveLength(1)
        expect(saved[0].payload).toEqual(passing)
        expect(rows()).toHaveLength(1)
        expect(textOf(rows()[0])).toContain('攻撃 Lv2')
        expect(useToastStore(m.pinia).items[0].message).toBe('護石を登録しました。')
        expect(body()).toContain('登録済みの護石（1）')
      },
      SLOW,
    )

    it(
      '登録の後は、スキルとスロットを空にし、レア度を残して、スキル1にフォーカスを移す',
      async () => {
        await ready()
        await click(radio(6))
        await pickSkill(1, '攻撃', '攻撃')
        await submit()
        await vi.waitFor(() => expect(rows()).toHaveLength(1))
        await vi.waitFor(() => expect(document.activeElement).toBe(skillInput(1)))
        expect(skillInput(1).value).toBe('')
        expect(radio(6).getAttribute('data-state')).toBe('checked')
      },
      SLOW,
    )

    it(
      '「入力を空にする」はレア度も含めて既定に戻す',
      async () => {
        await ready()
        await click(radio(7))
        await pickSkill(1, '攻撃', '攻撃')
        await click(findButton('入力を空にする'))
        expect(radio(7).getAttribute('data-state')).toBe('unchecked')
        expect(skillInput(1).value).toBe('')
      },
      SLOW,
    )

    it('再読み込みの後も、端末に保存した護石が一覧に残る', async () => {
      const repo = createMemoryCharmRepository([storedCharm(1, passing)])
      await ready(repo)
      expect(rows()).toHaveLength(1)
      mounted!.wrapper.unmount()
      mounted = null
      restoreStubs()
      await ready(repo)
      expect(rows()).toHaveLength(1)
    })

    it('0件のときは案内と「入力欄へ移動」を出し、押すとレア度にフォーカスを移す', async () => {
      await ready()
      expect(body()).toContain('護石が登録されていません。')
      await click(findButton('入力欄へ移動'))
      expect(document.activeElement).toBe(document.querySelector('[role="radio"]'))
    })
  })

  // 受入基準 2（名前か読みで検索し、かなとカタカナを同一視）
  describe('スキルの検索', () => {
    it(
      '名前でも読みでも、ひらがなでもカタカナでも見つかり、件数を補助の行に出す',
      async () => {
        await ready()
        await type(1, '攻')
        expect(options().map((o) => textOf(o))).toEqual(['攻撃防具'])
        expect(body()).toContain('「攻」を含むスキル: 1 件（名前と読み）')
        await type(1, 'こうげき')
        expect(options().map((o) => textOf(o))).toEqual(['攻撃防具'])
        await type(1, 'コウゲキ')
        expect(options().map((o) => textOf(o))).toEqual(['攻撃防具'])
      },
      SLOW,
    )

    it(
      '入力が空のときは武器→防具の順（シリーズ・グループは出さない）で全部を出す',
      async () => {
        await ready()
        skillInput(1).focus()
        skillInput(1).click()
        await vi.waitFor(() => expect(options().length).toBeGreaterThan(0))
        expect(options().map((o) => textOf(o))).toEqual(['剛刃武器', 'ガード防具', '攻撃防具'])
      },
      SLOW,
    )

    it(
      '該当が無いときは案内を出す',
      async () => {
        await ready()
        skillInput(1).focus()
        skillInput(1).value = 'zzz'
        skillInput(1).dispatchEvent(new Event('input', { bubbles: true }))
        await vi.waitFor(() =>
          expect(body()).toContain('該当するスキルがありません。名前か読みを変えてください。'),
        )
      },
      SLOW,
    )

    it(
      'レベルの選択肢は Lv1〜最大レベルで、スキルが空のあいだは無効',
      async () => {
        await ready()
        expect(findByLabel('スキル1のレベル').hasAttribute('disabled')).toBe(true)
        await pickSkill(1, 'ガード', 'ガード')
        await openSelect(findByLabel('スキル1のレベル'))
        expect(options().map((o) => textOf(o))).toEqual(['Lv1', 'Lv2', 'Lv3', 'Lv4'])
      },
      SLOW,
    )

    it(
      'スキルを空にするボタンで行を空にする',
      async () => {
        await ready()
        await pickSkill(1, '攻撃', '攻撃')
        await click(findByLabel('スキル1を空にする'))
        expect(skillInput(1).value).toBe('')
        expect(findByLabel('スキル1のレベル').hasAttribute('disabled')).toBe(true)
      },
      SLOW,
    )
  })

  // 受入基準 5（構造上の制約）
  describe('構造上の制約', () => {
    it('レア度が未選択のまま送信すると、直下にエラーを出して保存せず、フォーカスを移す', async () => {
      const m = await ready()
      await submit()
      expect(body()).toContain('レア度を選んでください。')
      expect(m.charms.charms).toHaveLength(0)
      expect(document.activeElement).toBe(document.querySelector('[role="radio"]'))
    })

    it(
      '同じスキルは後の行の直下にエラーを出し、保存しない',
      async () => {
        const m = await ready()
        await click(radio(8))
        await pickSkill(1, '攻撃', '攻撃')
        await pickSkill(2, '攻撃', '攻撃')
        await submit()
        expect(body()).toContain('スキル1と同じスキルです。別のスキルを選ぶか空にしてください。')
        expect(skillInput(2).getAttribute('aria-invalid')).toBe('true')
        expect(m.charms.charms).toHaveLength(0)
        await vi.waitFor(() => expect(document.activeElement).toBe(skillInput(2)))
      },
      SLOW,
    )

    it(
      '空の行の下にスキルがあるとエラーを出す',
      async () => {
        await ready()
        await click(radio(8))
        await pickSkill(2, '攻撃', '攻撃')
        await submit()
        expect(body()).toContain('スキル1が空です。スキルは上の行から順に入力してください。')
      },
      SLOW,
    )

    it(
      '空のスロットの下にスロットがあると、変更した時点でエラーを出す',
      async () => {
        await ready()
        await chooseOption(document.getElementById('charm-slot-2')!, '防具用 Lv2')
        expect(body()).toContain(
          'スロット1が「なし」です。スロットは上の行から順に入力してください。',
        )
      },
      SLOW,
    )

    it(
      '候補を選ばず文字だけが残っているときは、送信で「候補からスキルを選んでください。」を出す',
      async () => {
        const m = await ready()
        await click(radio(8))
        await type(1, '攻')
        await submit()
        expect(body()).toContain('候補からスキルを選んでください。')
        expect(m.charms.charms).toHaveLength(0)
      },
      SLOW,
    )

    it(
      'Combobox の Enter では送信しない',
      async () => {
        const m = await ready()
        await click(radio(8))
        await pickSkill(1, '攻撃', '攻撃')
        const event = new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
          cancelable: true,
        })
        skillInput(1).dispatchEvent(event)
        await flushPromises()
        expect(event.defaultPrevented).toBe(true)
        expect(m.charms.charms).toHaveLength(0)
      },
      SLOW,
    )
  })

  // 受入基準 6・7（照合の結果と確認）
  describe('照合の結果', () => {
    it(
      '合格: 「抽選テーブルに合います（レア8）。」を出す',
      async () => {
        await ready()
        await click(radio(8))
        await pickSkill(1, '攻撃', '攻撃', 2)
        await chooseOption(document.getElementById('charm-slot-1')!, '武器用 Lv1')
        expect(textOf(document.querySelector('output'))).toBe('抽選テーブルに合います（レア8）。')
      },
      SLOW,
    )

    it('未検査: テーブルの無いレア度は照合せず、そのまま登録できる', async () => {
      const m = await ready()
      await click(radio(6))
      expect(textOf(document.querySelector('output'))).toBe(
        'レア6の抽選テーブルは未整備のため、照合していません。このまま登録できます。',
      )
      await submit()
      await vi.waitFor(() => expect(m.charms.charms).toHaveLength(1))
    })

    it(
      'テーブル不一致: 合わない点を示し、確認のチェックを入れずに送信すると保存せずエラーを出す',
      async () => {
        const m = await ready()
        await click(radio(8))
        await pickSkill(1, '攻撃', '攻撃', 3)
        await chooseOption(document.getElementById('charm-slot-1')!, '武器用 Lv1')
        const band = textOf(document.querySelector('output'))
        expect(band).toContain('抽選テーブルに合いません（レア8）')
        expect(band).toContain('スキル1「攻撃 Lv3」は、レア8のスキル1の枠に出ません。')
        await submit()
        expect(body()).toContain('確認のチェックを入れてください。')
        expect(m.charms.charms).toHaveLength(0)
        expect(document.activeElement).toBe(document.getElementById('charm-confirm'))
      },
      SLOW,
    )

    it(
      '確認のチェックを入れると保存でき、入力を変えるとチェックは外れる',
      async () => {
        const m = await ready()
        await click(radio(8))
        await pickSkill(1, '攻撃', '攻撃', 3)
        await click(document.getElementById('charm-confirm')!)
        expect(document.getElementById('charm-confirm')!.getAttribute('data-state')).toBe('checked')
        await chooseOption(document.getElementById('charm-slot-1')!, '武器用 Lv1')
        expect(document.getElementById('charm-confirm')!.getAttribute('data-state')).toBe(
          'unchecked',
        )
        await click(document.getElementById('charm-confirm')!)
        await submit()
        await vi.waitFor(() => expect(m.charms.charms).toHaveLength(1))
        expect(m.charms.entries[0].match?.status).toBe('mismatch')
      },
      SLOW,
    )
  })

  // 受入基準 4（一覧）・8（候補になる件数）・10（検索対象外）
  describe('一覧', () => {
    const repo = () =>
      createMemoryCharmRepository([
        storedCharm(1, passing),
        storedCharm(2, mismatching),
        storedCharm(3, unchecked),
        storedCharm(4, overLevel),
      ])

    it('登録の新しい順に、レア度・スキル・スロット・照合の結果の状態ラベルを出す', async () => {
      await ready(repo())
      expect(rows().map((r) => r.dataset.charmId)).toEqual([
        charmId(4),
        charmId(3),
        charmId(2),
        charmId(1),
      ])
      expect(textOf(rows()[3])).toContain('レア8')
      expect(textOf(rows()[3])).toContain('合格')
      expect(textOf(rows()[3])).toContain('攻撃 Lv2')
      expect(textOf(rows()[3])).toContain('スロット 武器用 Lv1')
      expect(textOf(rows()[2])).toContain('テーブル不一致')
      expect(textOf(rows()[1])).toContain('未検査')
      expect(textOf(rows()[1])).toContain('スロットなし')
    })

    it('検索対象外の護石に理由を示し、見出しの下に候補の件数を出す', async () => {
      await ready(repo())
      const text = textOf(rows()[0])
      expect(text).toContain('検索対象外')
      expect(text).toContain('「攻撃 Lv9」が最大レベル（Lv3）を超えています。')
      expect(text).toContain('編集して直すまで、検索の候補から外します。')
      expect(body()).toContain('検索の候補になるのは 3 件です。')
    })

    it('編集と削除のボタンは、要約を aria-label に持つ', async () => {
      await ready(repo())
      expect(findByLabel('レア8・攻撃 Lv2・武器用 Lv1を編集').dataset.editId).toBe(charmId(1))
      expect(findByLabel('レア8・攻撃 Lv2・武器用 Lv1を削除').dataset.deleteId).toBe(charmId(1))
    })

    it(
      '編集: 同じ ID のまま上書きし、並びを変えず、フォーカスを「編集」に戻す',
      async () => {
        const r = repo()
        const m = await ready(r)
        await click(findByLabel('レア8・攻撃 Lv2・武器用 Lv1を編集'))
        expect(body()).toContain('護石を編集')
        expect(radio(8).getAttribute('data-state')).toBe('checked')
        expect(skillInput(1).value).toBe('攻撃')
        expect(rows()[3].className).toContain('bg-muted')
        await chooseOption(findByLabel('スキル1のレベル'), 'Lv1')
        await click(findButton('保存'))
        await vi.waitFor(() => expect(body()).toContain('護石を登録'))
        expect(r.snapshot().find((c) => c.id === charmId(1))!.payload.skills[0].level).toBe(1)
        expect(m.charms.charms.map((c) => c.id)[3]).toBe(charmId(1))
        expect(body()).not.toContain('護石を編集')
        await vi.waitFor(() =>
          expect(document.activeElement).toBe(rows()[3].querySelector('[data-edit-id]')),
        )
      },
      SLOW,
    )

    it('編集のキャンセルは変更を捨てて登録のモードに戻る', async () => {
      const r = repo()
      await ready(r)
      await click(findByLabel('レア8・攻撃 Lv2・武器用 Lv1を編集'))
      await click(findButton('キャンセル'))
      expect(body()).not.toContain('護石を編集')
      expect(skillInput(1).value).toBe('')
      expect(r.snapshot()).toHaveLength(4)
    })

    it('現行のマスターの最大レベルを超える護石を編集で開くと、その行にエラーを出す', async () => {
      await ready(repo())
      await click(findByLabel('レア8・攻撃 Lv9・武器用 Lv1を編集'))
      expect(body()).toContain(
        'Lv9 は最大レベル（Lv3）を超えています。レベルを選び直してください。',
      )
    })
  })

  // 受入基準 4（削除）
  describe('削除の確認（D3）', () => {
    const dialog = () => document.querySelector<HTMLElement>('[role="alertdialog"]')

    it(
      '確認の本文に要約を出し、キャンセルにフォーカスがある。キャンセルでは削除しない',
      async () => {
        const r = createMemoryCharmRepository([storedCharm(1, passing)])
        await ready(r)
        await click(findByLabel('レア8・攻撃 Lv2・武器用 Lv1を削除'))
        expect(textOf(dialog())).toContain('護石を削除しますか？')
        expect(textOf(dialog())).toContain(
          'レア8・攻撃 Lv2・武器用 Lv1。削除すると元に戻せません。',
        )
        expect(document.activeElement).toBe(findButton('キャンセル'))
        await click(findButton('キャンセル'))
        await vi.waitFor(() => expect(dialog()).toBeNull())
        expect(r.snapshot()).toHaveLength(1)
        await vi.waitFor(() =>
          expect(document.activeElement).toBe(rows()[0].querySelector('[data-delete-id]')),
        )
      },
      SLOW,
    )

    it(
      '削除すると端末から消してトーストを出し、フォーカスを次の行の「削除」へ移す',
      async () => {
        const r = createMemoryCharmRepository([storedCharm(1, passing), storedCharm(2, unchecked)])
        const m = await ready(r)
        await click(rows()[0].querySelector('[data-delete-id]')!)
        await click(findButton('削除', dialog()!))
        await vi.waitFor(() => expect(dialog()).toBeNull())
        expect(r.snapshot().map((c) => c.id)).toEqual([charmId(1)])
        expect(useToastStore(m.pinia).items.map((i) => i.message)).toContain('護石を削除しました。')
        await vi.waitFor(() =>
          expect(document.activeElement).toBe(rows()[0].querySelector('[data-delete-id]')),
        )
      },
      SLOW,
    )

    it(
      '最後の1件を削除したら、一覧の見出しにフォーカスを移す',
      async () => {
        await ready(createMemoryCharmRepository([storedCharm(1, passing)]))
        await click(rows()[0].querySelector('[data-delete-id]')!)
        await click(findButton('削除', dialog()!))
        await vi.waitFor(() => expect(document.activeElement?.tagName).toBe('H2'))
        expect(body()).toContain('護石が登録されていません。')
      },
      SLOW,
    )

    it(
      '編集中の護石を削除したら、登録のモードに戻す',
      async () => {
        await ready(createMemoryCharmRepository([storedCharm(1, passing)]))
        await click(findByLabel('レア8・攻撃 Lv2・武器用 Lv1を編集'))
        await click(findByLabel('レア8・攻撃 Lv2・武器用 Lv1を削除'))
        await click(findButton('削除', dialog()!))
        await vi.waitFor(() => expect(body()).not.toContain('護石を編集'))
      },
      SLOW,
    )
  })

  // 受入基準 11（保存できない・書き込みの失敗）
  describe('状態', () => {
    it('端末に保存できないときは、原因と次の行動を消えない表示で出し、フォームを無効にする', async () => {
      stubBackend({ bundle: makeTableBundle() })
      mounted = await mountReadyApp({ path: '/charms' })
      mounted.charms.setRepositoryOpener(async () => {
        throw Object.assign(new Error('x'), { name: 'SecurityError' })
      })
      await mounted.charms.ensureLoaded()
      await flushPromises()
      expect(body()).toContain('護石を保存できません')
      expect(body()).toContain('この端末のブラウザでは、端末への保存（IndexedDB）が使えません。')
      expect(body()).toContain('護石なしの検索は引き続き使えます。')
      expect(body()).toContain('端末に保存できないため、護石を登録できません。')
      expect(document.querySelector('form fieldset')!.hasAttribute('disabled')).toBe(true)
      expect(findButton('登録').hasAttribute('disabled')).toBe(true)
    })

    it('「再読み込み」で開き直し、回復したら登録できる', async () => {
      const r = createMemoryCharmRepository()
      stubBackend({ bundle: makeTableBundle() })
      mounted = await mountReadyApp({ path: '/charms' })
      let attempts = 0
      mounted.charms.setRepositoryOpener(async () => {
        attempts += 1
        if (attempts === 1) throw new Error('x')
        return r
      })
      await mounted.charms.ensureLoaded()
      await flushPromises()
      await click(findButton('再読み込み'))
      await vi.waitFor(() => expect(mounted!.charms.status).toBe('ready'))
      await flushPromises()
      expect(findButton('登録').hasAttribute('disabled')).toBe(false)
    })

    it('一覧を読めないときは「読み込みの失敗」の表示を出す', async () => {
      const r = createMemoryCharmRepository()
      r.failWith('list', 'unknown')
      await ready(r)
      expect(body()).toContain('護石を読み込めません')
      expect(body()).toContain('端末への保存（IndexedDB）に失敗しました。')
    })

    it(
      '書き込みに失敗したら、destructive のトーストを出し、フォームの入力を残す',
      async () => {
        const r = createMemoryCharmRepository()
        r.failWith('put', 'quota')
        const m = await ready(r)
        await click(radio(6))
        await pickSkill(1, 'ガード', 'ガード')
        await submit()
        await vi.waitFor(() => expect(useToastStore(m.pinia).items).toHaveLength(1))
        expect(useToastStore(m.pinia).items[0]).toMatchObject({ tone: 'destructive' })
        expect(body()).toContain('護石を保存できませんでした。端末の保存容量が足りません。')
        expect(skillInput(1).value).toBe('ガード')
        expect(radio(6).getAttribute('data-state')).toBe('checked')
      },
      SLOW,
    )

    it('読込中は300ms未満なら何も出さず、超えたらスケルトンを出す。フォームは描画しない', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      stubBackend({ hang: true })
      mounted = await mountApp({ path: '/charms' })
      expect(body()).not.toContain('読み込んでいます')
      vi.advanceTimersByTime(LOADING_SKELETON_DELAY_MS)
      await nextTick()
      expect(body()).toContain('護石とマスターデータを読み込んでいます…')
      expect(document.querySelector('form')).toBeNull()
    })

    it('マスターを読み込めないときは、再読み込みの表示を出し、フォームと一覧は出さない', async () => {
      stubBackend({ failMaster: true })
      mounted = await mountApp({ path: '/charms' })
      await vi.waitFor(() => expect(body()).toContain('データを読み込めませんでした'))
      expect(findButton('再読み込み')).toBeDefined()
      expect(document.querySelector('form')).toBeNull()
    })
  })
})
