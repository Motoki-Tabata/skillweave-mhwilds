import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import type { WeaponId } from '@swv/data'
import { LOADING_SKELETON_DELAY_MS } from '@/constants/search'
import { useToastStore } from '@/stores/toast'
import { createMemoryWeaponRepository } from '../support/weaponRepository'
import type { MemoryWeaponRepository } from '../support/weaponRepository'
import {
  ARTIA_BOW,
  GROUP_BONUS,
  SERIES_BONUS,
  makePayload,
  makeWeaponBundle,
  makeWeaponDictionary,
  storedWeapon,
  weaponId,
} from '../support/weapons'
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

const body = () => textOf(document.body)
const SLOW = 20000

describe('WeaponsView（S3・D4）', () => {
  let mounted: Mounted | null = null

  beforeAll(installDomPolyfills)
  afterEach(() => {
    mounted?.wrapper.unmount()
    mounted = null
    vi.useRealTimers()
    restoreStubs()
    document.body.innerHTML = ''
  })

  function stub(): void {
    stubBackend({ bundle: makeWeaponBundle(), dictionary: makeWeaponDictionary() })
  }

  async function ready(repository?: MemoryWeaponRepository): Promise<Mounted> {
    stub()
    mounted = await mountReadyApp({ path: '/weapons', weaponRepository: repository })
    await vi.waitFor(() => expect(mounted!.weapons.status).not.toBe('loading'))
    await flushPromises()
    return mounted
  }

  const byId = (id: string) => document.getElementById(id)!
  const input = (id: string) => byId(id) as HTMLInputElement
  const rows = () => Array.from(document.querySelectorAll<HTMLElement>('[data-weapon-id]'))
  const options = () => Array.from(document.querySelectorAll('[role="option"]'))
  const dialog = () => document.querySelector<HTMLElement>('[role="alertdialog"]')

  async function fill(id: string, value: string): Promise<void> {
    const element = input(id)
    element.value = value
    element.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
  }

  async function blur(id: string): Promise<void> {
    input(id).dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    input(id).dispatchEvent(new FocusEvent('blur'))
    await flushPromises()
  }

  async function openSelect(trigger: HTMLElement): Promise<void> {
    trigger.focus()
    trigger.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )
    await vi.waitFor(() => expect(options().length).toBeGreaterThan(0))
  }

  async function chooseOption(id: string, label: string): Promise<void> {
    await openSelect(byId(id))
    const option = options().find((o) => textOf(o) === label)
    if (option === undefined) throw new Error(`選択肢「${label}」がありません`)
    option.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )
    await vi.waitFor(() => expect(options()).toHaveLength(0))
    await flushPromises()
  }

  async function type(id: string, term: string): Promise<void> {
    const element = input(id)
    element.focus()
    element.value = term
    element.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.waitFor(() => expect(options().length).toBeGreaterThan(0))
  }

  async function pickBonus(id: string, term: string, name: string): Promise<void> {
    await type(id, term)
    const option = options().find((o) => textOf(o) === name)
    if (option === undefined) throw new Error(`候補「${name}」がありません`)
    option.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(input(id).value).toBe(name))
    await flushPromises()
  }

  const submit = () => click(findButton('登録'))

  async function fillRequired(): Promise<void> {
    await chooseOption('weapon-base', 'アーティアブレイドⅡ')
    await fill('weapon-attack', '200')
    await fill('weapon-affinity', '15')
  }

  // 受入基準 1・3（入力して登録し、端末に保存する）
  describe('登録', () => {
    it(
      '基の武器・名前・攻撃力・会心率・属性・スロット・付与スキルを入力して登録すると、端末に保存し一覧に出す',
      async () => {
        const m = await ready()
        await fillRequired()
        await fill('weapon-name', '  巨戟ブレイド ')
        await chooseOption('weapon-element-type', '火属性')
        await fill('weapon-element-value', '300')
        await chooseOption('weapon-slot-1', 'Lv3')
        await chooseOption('weapon-slot-2', 'Lv1')
        await pickBonus('weapon-series', '火竜', '火竜の力')
        await pickBonus('weapon-group', '不屈', '不屈の極み')
        await submit()
        await vi.waitFor(() => expect(m.weapons.weapons).toHaveLength(1))
        const saved = (m.weaponRepository as MemoryWeaponRepository).snapshot()
        expect(saved).toHaveLength(1)
        expect(saved[0].payload).toEqual(makePayload())
        expect(rows()).toHaveLength(1)
        expect(useToastStore(m.pinia).items[0].message).toBe('個体差のある武器を登録しました。')
        expect(body()).toContain('登録済みの武器（1）')
      },
      SLOW,
    )

    it(
      '全角の数字で入力しても整数として読み、属性なし・付与スキルなしで登録できる',
      async () => {
        const m = await ready()
        await chooseOption('weapon-base', 'アーティアボウⅠ')
        await fill('weapon-attack', '２５０')
        await fill('weapon-affinity', '－１０')
        await submit()
        await vi.waitFor(() => expect(m.weapons.weapons).toHaveLength(1))
        expect(m.weapons.weapons[0].payload).toEqual({
          baseWeaponId: ARTIA_BOW,
          name: '',
          attack: 250,
          affinity: -10,
          slots: [],
          seriesBonusId: null,
          groupBonusId: null,
        })
      },
      SLOW,
    )

    it(
      '登録の後は基の武器を残して他を既定に戻し、名前にフォーカスを移す。「入力を空にする」は基の武器も戻す',
      async () => {
        await ready()
        await fillRequired()
        await submit()
        await vi.waitFor(() => expect(rows()).toHaveLength(1))
        await vi.waitFor(() => expect(document.activeElement).toBe(byId('weapon-name')))
        expect(input('weapon-attack').value).toBe('')
        expect(textOf(byId('weapon-base'))).toBe('アーティアブレイドⅡ')
        await click(findButton('入力を空にする'))
        expect(textOf(byId('weapon-base'))).not.toContain('アーティアブレイドⅡ')
      },
      SLOW,
    )

    it('基の武器の選択肢は武器種ごとのグループに分け、選ぶと武器種を補助テキストで示す', async () => {
      await ready()
      await openSelect(byId('weapon-base'))
      const labels = Array.from(document.querySelectorAll('[data-slot="select-label"]')).map((el) =>
        textOf(el),
      )
      expect(labels).toEqual(['大剣', '弓'])
      expect(options().map((o) => textOf(o))).toEqual(['アーティアブレイドⅡ', 'アーティアボウⅠ'])
      options()[1].dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      )
      await vi.waitFor(() => expect(body()).toContain('武器種: 弓'))
    })

    it('再読み込みの後も、端末に保存した武器が一覧に残る', async () => {
      const repo = createMemoryWeaponRepository([storedWeapon(1)])
      await ready(repo)
      expect(rows()).toHaveLength(1)
      mounted!.wrapper.unmount()
      mounted = null
      restoreStubs()
      await ready(repo)
      expect(rows()).toHaveLength(1)
    })

    it('0件のときは案内と「入力欄へ移動」を出し、押すと基の武器にフォーカスを移す', async () => {
      await ready()
      expect(body()).toContain('個体差のある武器が登録されていません。')
      await click(findButton('入力欄へ移動'))
      expect(document.activeElement).toBe(byId('weapon-base'))
    })

    it('ページのタイトルは「個体差のある武器 | SkillWeave」', async () => {
      await ready()
      expect(document.title).toBe('個体差のある武器 | SkillWeave')
    })
  })

  // 受入基準 2（付与スキルは種別ごとに名前で選ぶ）
  describe('付与スキルの Combobox', () => {
    it(
      'シリーズスキルの欄にはシリーズだけが出る',
      async () => {
        await ready()
        await openCombobox('weapon-series')
        expect(options().map((o) => textOf(o))).toEqual(['火竜の力'])
      },
      SLOW,
    )

    it(
      'グループスキルの欄にはグループだけが出る',
      async () => {
        await ready()
        await openCombobox('weapon-group')
        expect(options().map((o) => textOf(o))).toEqual(['不屈の極み'])
      },
      SLOW,
    )

    async function openCombobox(id: string): Promise<void> {
      const element = input(id)
      element.focus()
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      await vi.waitFor(() => expect(options().length).toBeGreaterThan(0))
    }

    it(
      '武器スキル・防具スキルの名前では候補が出ず、該当なしの文言を出す',
      async () => {
        await ready()
        input('weapon-series').focus()
        await fill('weapon-series', '剛刃')
        await vi.waitFor(() =>
          expect(body()).toContain(
            '該当するシリーズスキルがありません。名前か読みを変えてください。',
          ),
        )
        expect(options()).toHaveLength(0)
        expect(body()).toContain('「剛刃」を含むシリーズスキル: 0 件（名前と読み）')
      },
      SLOW,
    )

    it(
      '空にするボタンで選んだ付与スキルを外す',
      async () => {
        await ready()
        await pickBonus('weapon-series', '火竜', '火竜の力')
        await click(findByLabel('シリーズスキルを空にする'))
        expect(input('weapon-series').value).toBe('')
      },
      SLOW,
    )

    it(
      'Combobox で Enter を押しても送信しない',
      async () => {
        await ready()
        await fillRequired()
        const element = input('weapon-series')
        element.focus()
        element.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
        )
        await flushPromises()
        expect(mounted!.weapons.weapons).toHaveLength(0)
      },
      SLOW,
    )
  })

  // 受入基準 5（構造上の制約に反する武器は保存せず、項目を示す）
  describe('構造上の制約', () => {
    it('基の武器が未選択のまま送信すると、直下にエラーを出し、保存せず、フォーカスを移す', async () => {
      const m = await ready()
      await submit()
      expect(textOf(byId('weapon-base-error'))).toBe('基の武器を選んでください。')
      expect(m.weapons.weapons).toHaveLength(0)
      await vi.waitFor(() => expect(document.activeElement).toBe(byId('weapon-base')))
    })

    it(
      '攻撃力が範囲外なら、攻撃力の直下にエラーを出し、保存しない',
      async () => {
        const m = await ready()
        await fillRequired()
        await fill('weapon-attack', '1000')
        await submit()
        expect(textOf(byId('weapon-attack-error'))).toBe(
          '攻撃力は 1〜999 の整数で入力してください。',
        )
        expect(input('weapon-attack').getAttribute('aria-invalid')).toBe('true')
        expect((m.weaponRepository as MemoryWeaponRepository).snapshot()).toHaveLength(0)
        await vi.waitFor(() => expect(document.activeElement).toBe(byId('weapon-attack')))
      },
      SLOW,
    )

    it(
      '空の攻撃力・会心率、範囲外の会心率の文言と、最初の不正な項目へのフォーカス',
      async () => {
        await ready()
        await chooseOption('weapon-base', 'アーティアブレイドⅡ')
        await submit()
        expect(body()).toContain('攻撃力を入力してください。')
        expect(body()).toContain('会心率を入力してください。')
        await vi.waitFor(() => expect(document.activeElement).toBe(byId('weapon-attack')))
        await fill('weapon-affinity', '101')
        expect(body()).toContain('会心率は -100〜100 の整数で入力してください。')
      },
      SLOW,
    )

    it(
      '属性の種類を選んで値が空・10 の倍数でないときは、属性の行の直下にエラーを出す',
      async () => {
        await ready()
        await fillRequired()
        await chooseOption('weapon-element-type', '雷属性')
        await submit()
        expect(textOf(byId('weapon-element-error'))).toBe('属性値を入力してください。')
        await fill('weapon-element-value', '305')
        expect(textOf(byId('weapon-element-error'))).toBe(
          '属性値は 10〜990 の 10 の倍数で入力してください。',
        )
        await chooseOption('weapon-element-type', 'なし')
        expect(input('weapon-element-value').disabled).toBe(true)
        expect(input('weapon-element-value').value).toBe('')
        expect(document.getElementById('weapon-element-error')).toBeNull()
      },
      SLOW,
    )

    it(
      '空のスロットの下にスロットがあるときは、空の行の直下にエラーを出す',
      async () => {
        await ready()
        await chooseOption('weapon-slot-2', 'Lv2')
        expect(textOf(byId('weapon-slot-1-error'))).toBe(
          'スロット1が「なし」です。スロットは上の行から順に入力してください。',
        )
      },
      SLOW,
    )

    it(
      '名前が 30 文字を超えると、名前の直下にエラーを出す',
      async () => {
        await ready()
        await fill('weapon-name', 'あ'.repeat(31))
        await blur('weapon-name')
        expect(textOf(byId('weapon-name-error'))).toBe('名前は 30 文字以内で入力してください。')
        await fill('weapon-name', 'あ'.repeat(30))
        expect(document.getElementById('weapon-name-error')).toBeNull()
      },
      SLOW,
    )

    it(
      'Combobox に文字があるのに候補を選んでいないときは、その行の直下にエラーを出す',
      async () => {
        const m = await ready()
        await fillRequired()
        await fill('weapon-group', '不屈')
        await submit()
        expect(textOf(byId('weapon-group-error'))).toBe('候補からグループスキルを選んでください。')
        expect(m.weapons.weapons).toHaveLength(0)
      },
      SLOW,
    )

    it(
      'マスターに無い基の武器・付与スキルの武器を編集で開くと、その項目にエラーを出す',
      async () => {
        await ready(
          createMemoryWeaponRepository([
            storedWeapon(1, {
              baseWeaponId: 'wp:gone' as WeaponId,
              seriesBonusId: GROUP_BONUS,
              groupBonusId: SERIES_BONUS,
            }),
          ]),
        )
        await click(rows()[0].querySelector('[data-edit-id]')!)
        expect(body()).toContain('この基の武器は現行のマスターにありません。選び直してください。')
        expect(body()).toContain(
          'このシリーズスキルは現行のマスターにありません。別のスキルを選ぶか空にしてください。',
        )
        expect(body()).toContain(
          'このグループスキルは現行のマスターにありません。別のスキルを選ぶか空にしてください。',
        )
      },
      SLOW,
    )
  })

  // 受入基準 4・10（一覧と検索対象外）
  describe('一覧', () => {
    const repo = () =>
      createMemoryWeaponRepository([
        storedWeapon(1, { name: '' }),
        storedWeapon(2, { baseWeaponId: 'wp:gone' as WeaponId, name: '' }),
        storedWeapon(3, { seriesBonusId: null, groupBonusId: null, element: undefined, slots: [] }),
      ])

    it('登録の新しい順に、表示名・武器種・性能・付与スキルを出す', async () => {
      await ready(repo())
      const [third, , first] = rows()
      expect(textOf(third)).toContain('巨戟ブレイド')
      expect(textOf(third)).toContain('大剣 ／ 基の武器 アーティアブレイドⅡ')
      expect(textOf(third)).toContain('攻撃力 200 ／ 会心 15% ／ スロット なし')
      expect(textOf(third)).toContain('付与スキルなし')
      expect(textOf(first)).toContain('アーティアブレイドⅡ')
      expect(textOf(first)).toContain('攻撃力 200 ／ 会心 15% ／ 火属性 300 ／ スロット Lv3・Lv1')
      expect(textOf(first)).toContain('火竜の力（シリーズ）')
      expect(textOf(first)).toContain('不屈の極み（グループ）')
    })

    it('検索対象外の武器に Badge と理由を示し、見出しの下に候補の件数を出す', async () => {
      await ready(repo())
      const gone = rows()[1]
      expect(textOf(gone)).toContain('（基の武器が見つかりません）')
      expect(textOf(gone)).toContain('検索対象外')
      expect(textOf(gone)).toContain('基の武器が現行のマスターにありません。')
      expect(textOf(gone)).toContain('編集して直すまで、検索の候補から外します。')
      expect(textOf(rows()[0])).not.toContain('検索対象外')
      expect(body()).toContain('検索の候補になるのは 2 件です。')
    })

    it('編集と削除のボタンは、表示名を aria-label に持つ', async () => {
      await ready(repo())
      expect(findByLabel('巨戟ブレイドを編集')).toBeDefined()
      expect(findByLabel('アーティアブレイドⅡを削除')).toBeDefined()
    })

    it(
      '編集: 同じ ID のまま上書きし、並びを変えず、フォーカスを「編集」に戻す',
      async () => {
        const r = repo()
        const m = await ready(r)
        await click(findByLabel('アーティアブレイドⅡを編集'))
        expect(body()).toContain('武器を編集')
        expect(input('weapon-attack').value).toBe('200')
        expect(input('weapon-element-value').value).toBe('300')
        expect(input('weapon-series').value).toBe('火竜の力')
        expect(rows()[2].className).toContain('bg-muted')
        await fill('weapon-attack', '210')
        await click(findButton('保存'))
        await vi.waitFor(() => expect(body()).toContain('武器を登録'))
        expect(r.snapshot().find((w) => w.id === weaponId(1))!.payload.attack).toBe(210)
        expect(m.weapons.weapons.map((w) => w.id)[2]).toBe(weaponId(1))
        await vi.waitFor(() =>
          expect(document.activeElement).toBe(rows()[2].querySelector('[data-edit-id]')),
        )
      },
      SLOW,
    )

    it(
      '編集のキャンセルは変更を捨てて登録のモードに戻る',
      async () => {
        const r = repo()
        await ready(r)
        await click(findByLabel('アーティアブレイドⅡを編集'))
        await fill('weapon-attack', '999')
        await click(findButton('キャンセル'))
        expect(body()).not.toContain('武器を編集')
        expect(input('weapon-attack').value).toBe('')
        expect(r.snapshot().find((w) => w.id === weaponId(1))!.payload.attack).toBe(200)
      },
      SLOW,
    )
  })

  // 受入基準 11（削除と、検索条件の選択の解除）
  describe('削除の確認（D4）', () => {
    it(
      '確認の本文に要約を出し、キャンセルにフォーカスがある。キャンセルでは削除しない',
      async () => {
        const r = createMemoryWeaponRepository([storedWeapon(1)])
        await ready(r)
        await click(findByLabel('巨戟ブレイドを削除'))
        expect(textOf(dialog())).toContain('個体差のある武器を削除しますか？')
        expect(textOf(dialog())).toContain(
          '巨戟ブレイド ／ 大剣 ／ 攻撃力 200 ／ 会心 15%。削除すると元に戻せません。',
        )
        expect(textOf(dialog())).not.toContain('検索条件の武器の選択も外します。')
        expect(document.activeElement).toBe(findButton('キャンセル'))
        await click(findButton('キャンセル'))
        await vi.waitFor(() => expect(dialog()).toBeNull())
        expect(r.snapshot()).toHaveLength(1)
      },
      SLOW,
    )

    it(
      '削除すると端末から消してトーストを出し、フォーカスを次の行の「削除」へ移す',
      async () => {
        const r = createMemoryWeaponRepository([storedWeapon(1), storedWeapon(2)])
        const m = await ready(r)
        await click(rows()[0].querySelector('[data-delete-id]')!)
        await click(findButton('削除', dialog()!))
        await vi.waitFor(() => expect(dialog()).toBeNull())
        expect(r.snapshot().map((w) => w.id)).toEqual([weaponId(1)])
        expect(useToastStore(m.pinia).items.map((i) => i.message)).toContain(
          '個体差のある武器を削除しました。',
        )
        await vi.waitFor(() =>
          expect(document.activeElement).toBe(rows()[0].querySelector('[data-delete-id]')),
        )
      },
      SLOW,
    )

    it(
      '最後の1件を削除したら、一覧の見出しにフォーカスを移す',
      async () => {
        await ready(createMemoryWeaponRepository([storedWeapon(1)]))
        await click(rows()[0].querySelector('[data-delete-id]')!)
        await click(findButton('削除', dialog()!))
        await vi.waitFor(() => expect(document.activeElement?.tagName).toBe('H2'))
        expect(body()).toContain('個体差のある武器が登録されていません。')
      },
      SLOW,
    )

    it(
      '編集中の武器を削除したら、登録のモードに戻す',
      async () => {
        await ready(createMemoryWeaponRepository([storedWeapon(1)]))
        await click(findByLabel('巨戟ブレイドを編集'))
        await click(findByLabel('巨戟ブレイドを削除'))
        await click(findButton('削除', dialog()!))
        await vi.waitFor(() => expect(body()).not.toContain('武器を編集'))
      },
      SLOW,
    )

    it(
      '検索条件で選んでいる武器を削除すると、本文に断りを出し、検索条件の選択を外す',
      async () => {
        const m = await ready(createMemoryWeaponRepository([storedWeapon(1)]))
        m.conditions.selectWeapon(weaponId(1) as WeaponId)
        await click(findByLabel('巨戟ブレイドを削除'))
        expect(textOf(dialog())).toContain('検索条件の武器の選択も外します。')
        await click(findButton('削除', dialog()!))
        await vi.waitFor(() => expect(m.conditions.weaponId).toBeNull())
      },
      SLOW,
    )

    it(
      '削除に失敗したときは、検索条件の選択を外さず、一覧も変えない',
      async () => {
        const r = createMemoryWeaponRepository([storedWeapon(1)])
        r.failWith('delete', 'unknown')
        const m = await ready(r)
        m.conditions.selectWeapon(weaponId(1) as WeaponId)
        await click(findByLabel('巨戟ブレイドを削除'))
        await click(findButton('削除', dialog()!))
        await vi.waitFor(() => expect(useToastStore(m.pinia).items).toHaveLength(1))
        expect(m.conditions.weaponId).toBe(weaponId(1))
        expect(rows()).toHaveLength(1)
      },
      SLOW,
    )
  })

  // 受入基準 12（保存できない・書き込みの失敗）
  describe('状態', () => {
    it('端末に保存できないときは、原因と次の行動を消えない表示で出し、フォームを無効にする', async () => {
      stub()
      mounted = await mountReadyApp({ path: '/weapons' })
      mounted.weapons.setRepositoryOpener(async () => {
        throw Object.assign(new Error('x'), { name: 'SecurityError' })
      })
      await mounted.weapons.ensureLoaded()
      await flushPromises()
      expect(body()).toContain('個体差のある武器を保存できません')
      expect(body()).toContain('この端末のブラウザでは、端末への保存（IndexedDB）が使えません。')
      expect(body()).toContain('通常の武器での検索は引き続き使えます。')
      expect(body()).toContain('端末に保存できないため、個体差のある武器を登録できません。')
      expect(document.querySelector('form fieldset')!.hasAttribute('disabled')).toBe(true)
      expect(findButton('登録').hasAttribute('disabled')).toBe(true)
    })

    it('「再読み込み」で開き直し、回復したら登録できる', async () => {
      const r = createMemoryWeaponRepository()
      stub()
      mounted = await mountReadyApp({ path: '/weapons' })
      let attempts = 0
      mounted.weapons.setRepositoryOpener(async () => {
        attempts += 1
        if (attempts === 1) throw new Error('x')
        return r
      })
      await mounted.weapons.ensureLoaded()
      await flushPromises()
      await click(findButton('再読み込み'))
      await vi.waitFor(() => expect(mounted!.weapons.status).toBe('ready'))
      await flushPromises()
      expect(findButton('登録').hasAttribute('disabled')).toBe(false)
    })

    it('一覧を読めないときは「読み込めません」の表示を出す', async () => {
      const r = createMemoryWeaponRepository()
      r.failWith('list', 'unknown')
      await ready(r)
      expect(body()).toContain('個体差のある武器を読み込めません')
      expect(body()).toContain('端末への保存（IndexedDB）に失敗しました。')
    })

    it(
      '書き込みに失敗したら、destructive のトーストを出し、フォームの入力を残す',
      async () => {
        const r = createMemoryWeaponRepository()
        r.failWith('put', 'quota')
        const m = await ready(r)
        await fillRequired()
        await submit()
        await vi.waitFor(() => expect(useToastStore(m.pinia).items).toHaveLength(1))
        expect(useToastStore(m.pinia).items[0]).toMatchObject({ tone: 'destructive' })
        expect(body()).toContain(
          '個体差のある武器を保存できませんでした。端末の保存容量が足りません。',
        )
        expect(input('weapon-attack').value).toBe('200')
        expect(rows()).toHaveLength(0)
      },
      SLOW,
    )

    it('読込中は300ms未満なら何も出さず、超えたらスケルトンを出す。フォームは描画しない', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      stubBackend({ hang: true })
      mounted = await mountApp({ path: '/weapons' })
      expect(body()).not.toContain('読み込んでいます')
      vi.advanceTimersByTime(LOADING_SKELETON_DELAY_MS)
      await nextTick()
      expect(body()).toContain('武器とマスターデータを読み込んでいます…')
      expect(document.querySelector('form')).toBeNull()
    })

    it('マスターを読み込めないときは、再読み込みの表示を出し、フォームと一覧は出さない', async () => {
      stubBackend({ failMaster: true })
      mounted = await mountApp({ path: '/weapons' })
      await vi.waitFor(() => expect(body()).toContain('データを読み込めませんでした'))
      expect(findButton('再読み込み')).toBeDefined()
      expect(document.querySelector('form')).toBeNull()
    })
  })
})
