import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import BuildCard from '@/components/search/BuildCard.vue'
import type { SolvedBuild } from '@swv/solver'
import type { CharmPayload } from '@/lib/charms/types'
import { createMemoryCharmRepository } from '../../support/charmRepository'
import { charmId, storedCharm } from '../../support/charms'
import { FakeWorker, cd, dc, makeBuild, sk, wp } from '../../support/fixtures'
import { createMemoryWeaponRepository } from '../../support/weaponRepository'
import {
  makeWeaponBundle,
  makeWeaponDictionary,
  storedWeapon,
  weaponId,
} from '../../support/weapons'
import {
  click,
  installDomPolyfills,
  mountReadyApp,
  restoreStubs,
  stubBackend,
  textOf,
} from '../../support/mount'
import type { Mounted } from '../../support/mount'

// 受入基準 9（構成カードの表示項目）
describe('BuildCard', () => {
  let mounted: Mounted | null = null

  beforeAll(installDomPolyfills)
  afterEach(() => {
    mounted?.wrapper.unmount()
    mounted = null
    restoreStubs()
  })

  /** 武器を選んで検索し、構成を結果として返す。 */
  async function showBuilds(
    builds: SolvedBuild[],
    beforeSearch: (m: Mounted) => void = () => {},
  ): Promise<Mounted> {
    stubBackend()
    mounted = await mountReadyApp()
    mounted.conditions.selectWeapon(wp('great-sword:1'))
    beforeSearch(mounted)
    await flushPromises()
    await click(document.querySelector('button[type="submit"]')!)
    const worker = FakeWorker.last
    worker.emit({
      type: 'result',
      requestId: worker.lastSolveId,
      response: { status: 'optimal', builds, elapsedMs: 1 },
    })
    await flushPromises()
    return mounted
  }

  const card = (index = 0) =>
    document.querySelectorAll<HTMLElement>('#results-heading ~ ul > li')[index]
  const rowsOf = (table: Element) =>
    Array.from(table.querySelectorAll('tbody tr')).map((tr) =>
      Array.from(tr.querySelectorAll('td')).map((td) => textOf(td)),
    )
  const section = (name: string, root: Element) =>
    Array.from(root.querySelectorAll('section')).find(
      (s) => textOf(s.querySelector('h4')) === name,
    )!

  it('見出し行に連番と防御力の合計を出す', async () => {
    await showBuilds([makeBuild(), makeBuild()])
    expect(document.querySelectorAll('#results-heading ~ ul > li')).toHaveLength(2)
    expect(textOf(card(0).querySelector('h3'))).toBe('構成 1')
    expect(textOf(card(1).querySelector('h3'))).toBe('構成 2')
    expect(textOf(card(0).querySelector('h3 ~ div p:last-child'))).toBe('防御力 20')
  })

  it('防具5部位を表で出す。防具が無い部位は「防具なし」。見出しセルは thead の th scope="col"', async () => {
    await showBuilds([makeBuild()])
    const table = section('防具', card()).querySelector('table')!
    const heads = Array.from(table.querySelectorAll('thead th'))
    expect(heads.map((th) => textOf(th))).toEqual(['部位', '防具', '防御力'])
    expect(heads.every((th) => th.getAttribute('scope') === 'col')).toBe(true)
    expect(rowsOf(table)).toEqual([
      ['頭', '上位の頭', '20'],
      ['胴', '防具なし', '0'],
      ['腕', '防具なし', '0'],
      ['腰', '防具なし', '0'],
      ['脚', '防具なし', '0'],
    ])
    expect(textOf(table.querySelector('tfoot'))).toBe('防御力の合計20')
  })

  it('装飾品は持ち主・スロットの Lv・名前', async () => {
    await showBuilds([makeBuild()])
    const table = section('装飾品', card()).querySelector('table')!
    expect(Array.from(table.querySelectorAll('thead th')).map((th) => textOf(th))).toEqual([
      '持ち主',
      'スロット',
      '装飾品',
    ])
    expect(rowsOf(table)).toEqual([['頭', 'Lv2', '攻撃珠【２】']])
  })

  it('発動スキルは種類ごとの行に、名前とレベル（頭打ち後）を出す', async () => {
    await showBuilds([makeBuild()])
    const rows = Array.from(section('発動スキル', card()).querySelectorAll(':scope > div')).map(
      (row) => [
        textOf(row.querySelector('span')),
        ...Array.from(row.querySelectorAll('li')).map((li) => textOf(li)),
      ],
    )
    expect(rows).toEqual([
      ['武器', '剛刃 Lv2'],
      ['防具', '攻撃 Lv1'],
    ])
  })

  it('空きスロットは持ち主と Lv', async () => {
    await showBuilds([makeBuild()])
    const chips = Array.from(section('空きスロット', card()).querySelectorAll('li')).map((li) =>
      textOf(li),
    )
    expect(chips).toEqual(['武器 Lv3', '武器 Lv1'])
  })

  it('装飾品・発動スキル・空きスロットが0件のときは、その旨を出す', async () => {
    await showBuilds([{ ...makeBuild(), decorations: [], skills: [], freeSlots: [] }])
    expect(textOf(section('装飾品', card()))).toContain('装飾品なし')
    expect(section('装飾品', card()).querySelector('table')).toBeNull()
    expect(textOf(section('発動スキル', card()))).toContain('発動するスキルはありません')
    expect(textOf(section('空きスロット', card()))).toContain('空きスロットなし')
  })

  // 受入基準 9（護石の節・護石のスロットの Lv・検索後の編集に影響されない）、8（要約の護石の件数）
  describe('護石', () => {
    const payload: CharmPayload = {
      rarity: 8,
      skills: [
        { skillId: sk('a1'), level: 2 },
        { skillId: sk('w1'), level: 1 },
      ],
      slots: [
        { target: 'weapon', level: 1 },
        { target: 'armor', level: 2 },
      ],
    }
    const charmBuild = (): SolvedBuild => ({
      ...makeBuild(),
      charmId: charmId(1) as SolvedBuild['charmId'],
      decorations: [{ slot: { owner: 'charm', index: 1 }, decorationId: dc('1') }],
      freeSlots: [{ owner: 'charm', index: 0 }],
    })

    async function showWithCharm(builds: SolvedBuild[], payloads: CharmPayload[] = [payload]) {
      stubBackend()
      mounted = await mountReadyApp({
        charmRepository: createMemoryCharmRepository(payloads.map((p, i) => storedCharm(i + 1, p))),
      })
      await vi.waitFor(() => expect(mounted!.charms.status).toBe('ready'))
      mounted.conditions.selectWeapon(wp('great-sword:1'))
      await flushPromises()
      await click(document.querySelector('button[type="submit"]')!)
      const worker = FakeWorker.last
      worker.emit({
        type: 'result',
        requestId: worker.lastSolveId,
        response: { status: 'optimal', builds, elapsedMs: 1 },
      })
      await flushPromises()
      return mounted
    }

    it('使った護石のレア度・スキル・スロット（武器用・防具用）を、防具と装飾品のあいだに出す', async () => {
      await showWithCharm([charmBuild()])
      const headings = Array.from(card().querySelectorAll('h4')).map((h) => textOf(h))
      expect(headings.slice(0, 4)).toEqual(['火力', '防具', '護石', '装飾品'])
      const text = textOf(section('護石', card()))
      expect(text).toContain('レア度8')
      expect(text).toContain('攻撃 Lv2')
      expect(text).toContain('剛刃 Lv1')
      expect(text).toContain('武器用 Lv1・防具用 Lv2')
    })

    it('装飾品の表と空きスロットに、護石のスロットの Lv を出す', async () => {
      await showWithCharm([charmBuild()])
      const table = section('装飾品', card()).querySelector('table')!
      expect(rowsOf(table)).toEqual([['護石', 'Lv2', '攻撃珠【２】']])
      const chips = Array.from(section('空きスロット', card()).querySelectorAll('li')).map((li) =>
        textOf(li),
      )
      expect(chips).toEqual(['護石 Lv1'])
    })

    it('スキルもスロットも無い護石は「スキルなし」「スロットなし」', async () => {
      await showWithCharm(
        [{ ...charmBuild(), decorations: [], freeSlots: [] }],
        [{ rarity: 5, skills: [], slots: [] }],
      )
      const text = textOf(section('護石', card()))
      expect(text).toContain('スキルなし')
      expect(text).toContain('スロットなし')
    })

    it('候補があるのに構成が護石を使わないときは「護石なし」。候補が0件なら節ごと出さない', async () => {
      await showWithCharm([makeBuild()])
      expect(textOf(section('護石', card()))).toContain('護石なし')
      mounted?.wrapper.unmount()
      restoreStubs()
      await showBuilds([makeBuild()])
      const headings = Array.from(card().querySelectorAll('h4')).map((h) => textOf(h))
      expect(headings).not.toContain('護石')
    })

    it('検索の後に護石を編集・削除しても、表示中の結果は変わらない', async () => {
      const m = await showWithCharm([charmBuild()])
      await m.charms.save({ ...payload, rarity: 6, skills: [] }, m.charms.charms[0])
      await flushPromises()
      expect(textOf(section('護石', card()))).toContain('レア度8')
      await m.charms.remove(charmId(1))
      await flushPromises()
      expect(textOf(section('護石', card()))).toContain('攻撃 Lv2')
      expect(rowsOf(section('装飾品', card()).querySelector('table')!)).toEqual([
        ['護石', 'Lv2', '攻撃珠【２】'],
      ])
    })

    it('検索条件の要約に護石の件数を出す', async () => {
      await showWithCharm([charmBuild()])
      expect(textOf(document.querySelector('#results-heading')!.parentElement)).toContain(
        '／ 護石 1 件',
      )
    })
  })

  it('検索の後に武器の選択を変えても、結果は検索したときの武器で表示する', async () => {
    const m = await showBuilds([makeBuild()])
    m.conditions.selectWeapon(wp('bow:1'))
    await flushPromises()
    const chips = Array.from(section('空きスロット', card()).querySelectorAll('li')).map((li) =>
      textOf(li),
    )
    expect(chips).toEqual(['武器 Lv3', '武器 Lv1'])
  })
})

// 受入基準 4・5・6（火力の表示と丸め、検索の後の変更に影響されないこと）
describe('BuildCard の火力', () => {
  let mounted: Mounted | null = null

  beforeAll(installDomPolyfills)
  afterEach(() => {
    mounted?.wrapper.unmount()
    mounted = null
    restoreStubs()
  })

  // 攻撃 Lv3（攻撃力 ×1.04・+9、有効部位で会心率 +20%）。武器は攻撃力 250・会心率 -15%
  const strongBuild = (): SolvedBuild => ({
    ...makeBuild(),
    skills: [{ skillId: sk('a1'), level: 3, rawLevel: 3 }],
  })

  async function show(
    builds: SolvedBuild[],
    beforeSearch: (m: Mounted) => void = () => {},
  ): Promise<Mounted> {
    stubBackend()
    mounted = await mountReadyApp()
    mounted.conditions.selectWeapon(wp('great-sword:1'))
    beforeSearch(mounted)
    await flushPromises()
    await click(document.querySelector('button[type="submit"]')!)
    const worker = FakeWorker.last
    worker.emit({
      type: 'result',
      requestId: worker.lastSolveId,
      response: { status: 'optimal', builds, elapsedMs: 1 },
    })
    await flushPromises()
    return mounted
  }

  const card = (index = 0) =>
    document.querySelectorAll<HTMLElement>('#results-heading ~ ul > li')[index]
  const damageOf = (root: Element) => {
    const section = Array.from(root.querySelectorAll('section')).find(
      (s) => textOf(s.querySelector('h4')) === '火力',
    )!
    return Array.from(section.querySelectorAll('dl > div')).map((row) => [
      textOf(row.querySelector('dt')),
      textOf(row.querySelector('dd')),
    ])
  }

  it('[基準4・5] どの構成にも、期待値・攻撃力・会心率・会心倍率を丸めて出す。見出し行にも期待値を出す', async () => {
    await show([strongBuild(), makeBuild()])
    // 250×1.04+9 = 269.0、会心率 -15%、倍率 1.25 → 269×0.9625 = 258.9125
    expect(damageOf(card(0))).toEqual([
      ['期待値', '258.9'],
      ['攻撃力', '269.0'],
      ['会心率', '-15%'],
      ['会心倍率', '1.25'],
    ])
    expect(textOf(card(0).querySelector('h3 ~ div p'))).toBe('期待値 258.9')
    // 250+3 = 253.0、253×0.9625 = 243.5125
    expect(damageOf(card(1))[0]).toEqual(['期待値', '243.5'])
  })

  it('[基準1・5] 期待値が昇順の2構成でも、ソルバーが返した順のまま並べ、期待値（丸めた値を含む）で並べ替えない', async () => {
    // 返した順: 1件目 243.5125（253×0.9625）→ 2件目 258.9125（269×0.9625）
    await show([makeBuild(), strongBuild()])
    expect(textOf(card(0).querySelector('h3'))).toBe('構成 1')
    expect(textOf(card(0).querySelector('h3 ~ div p'))).toBe('期待値 243.5')
    expect(textOf(card(1).querySelector('h3'))).toBe('構成 2')
    expect(textOf(card(1).querySelector('h3 ~ div p'))).toBe('期待値 258.9')
  })

  it('[基準4] 検索したときにオンの発動条件を火力に数える', async () => {
    await show([strongBuild()], (m) => m.conditions.setConditionActive(cd('weak_point'), true))
    // 会心率 5% → 269×(1+0.05×0.25) = 272.3625
    expect(damageOf(card())).toEqual([
      ['期待値', '272.4'],
      ['攻撃力', '269.0'],
      ['会心率', '5%'],
      ['会心倍率', '1.25'],
    ])
  })

  it('[基準6] 検索の後に発動条件のトグルと武器を変えても、火力は変わらない', async () => {
    const m = await show([strongBuild()])
    const before = damageOf(card())
    m.conditions.setConditionActive(cd('weak_point'), true)
    m.conditions.selectWeapon(wp('long-sword:1'))
    await flushPromises()
    expect(damageOf(card())).toEqual(before)
  })
})

// 受入基準 7・10（スキルの効果の開閉と、説明文・補完）
describe('BuildCard のスキルの効果', () => {
  let mounted: Mounted | null = null

  beforeAll(installDomPolyfills)
  afterEach(() => {
    mounted?.wrapper.unmount()
    mounted = null
    restoreStubs()
  })

  async function show(builds: SolvedBuild[]): Promise<void> {
    stubBackend()
    mounted = await mountReadyApp()
    mounted.conditions.selectWeapon(wp('great-sword:1'))
    await flushPromises()
    await click(document.querySelector('button[type="submit"]')!)
    const worker = FakeWorker.last
    worker.emit({
      type: 'result',
      requestId: worker.lastSolveId,
      response: { status: 'optimal', builds, elapsedMs: 1 },
    })
    await flushPromises()
  }

  const card = (index = 0) =>
    document.querySelectorAll<HTMLElement>('#results-heading ~ ul > li')[index]
  const toggle = (index = 0) =>
    Array.from(card(index).querySelectorAll('button')).find((b) =>
      b.hasAttribute('aria-expanded'),
    ) as HTMLButtonElement | undefined
  const detailRows = (index = 0) =>
    Array.from(card(index).querySelectorAll('dl[id] > div')).map((row) => ({
      title: textOf(row.querySelector('dt')),
      paragraphs: Array.from(row.querySelectorAll('dd p')).map((p) => p.textContent ?? ''),
    }))

  const withSkills = (skills: SolvedBuild['skills']): SolvedBuild => ({ ...makeBuild(), skills })

  it('[基準7] 既定は閉じ。開閉のボタンは件数を出し、aria-expanded と aria-controls を持つ', async () => {
    await show([makeBuild()])
    const button = toggle()!
    expect(textOf(button)).toBe('スキルの効果を表示（2）')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(detailRows()).toEqual([])
    await click(button)
    expect(textOf(button)).toBe('スキルの効果を隠す')
    expect(button.getAttribute('aria-expanded')).toBe('true')
    const list = card().querySelector('dl[id]')!
    expect(button.getAttribute('aria-controls')).toBe(list.id)
    await click(button)
    expect(detailRows()).toEqual([])
  })

  it('[基準7] 開閉は構成カードごとに独立している', async () => {
    await show([makeBuild(), makeBuild()])
    await click(toggle(0)!)
    expect(toggle(0)!.getAttribute('aria-expanded')).toBe('true')
    expect(toggle(1)!.getAttribute('aria-expanded')).toBe('false')
  })

  it('[基準7] 発動スキルが0件のときはボタンを出さない', async () => {
    await show([withSkills([])])
    expect(toggle()).toBeUndefined()
  })

  it('[基準7・9] 発動しているレベルの説明文（改行を保つ）と補完を、チップと同じ並びで出す', async () => {
    await show([
      withSkills([
        { skillId: sk('a1'), level: 3, rawLevel: 3 },
        { skillId: sk('w1'), level: 2, rawLevel: 2 },
      ]),
    ])
    await click(toggle()!)
    // 武器 → 防具の順（チップと同じ）
    expect(detailRows()).toEqual([
      { title: '剛刃 Lv2', paragraphs: ['武器の切れ味が増す。'] },
      {
        title: '攻撃 Lv3',
        paragraphs: [
          '攻撃力が大きく上がる。\n会心率も上がる。',
          '効果: 攻撃力 ×1.04・攻撃力 +9 ／ 会心率 +20%（有効部位への攻撃）',
        ],
      },
    ])
    expect(card().querySelector('dl[id] p')!.className).toContain('whitespace-pre-line')
  })

  it('[基準10] 説明文が無いレベルは補完だけ、補完が無いレベルは説明文だけ、どちらも無ければ見出しだけ', async () => {
    await show([
      withSkills([{ skillId: sk('w1'), level: 5, rawLevel: 5 }]), // 説明文なし・効果あり
      withSkills([{ skillId: sk('w1'), level: 1, rawLevel: 1 }]), // 説明文が空・効果なし
    ])
    await click(toggle(0)!)
    await click(toggle(1)!)
    expect(detailRows(0)).toEqual([{ title: '剛刃 Lv5', paragraphs: ['効果: 攻撃力 +10'] }])
    expect(detailRows(1)).toEqual([{ title: '剛刃 Lv1', paragraphs: [] }])
  })
})

// 受入基準 7・8・9（個体差のある武器での検索結果。検索した時点の写しで表示する）
describe('BuildCard の個体差のある武器', () => {
  let mounted: Mounted | null = null

  beforeAll(installDomPolyfills)
  afterEach(() => {
    mounted?.wrapper.unmount()
    mounted = null
    restoreStubs()
  })

  async function show(): Promise<Mounted> {
    stubBackend({ bundle: makeWeaponBundle(), dictionary: makeWeaponDictionary() })
    mounted = await mountReadyApp({
      weaponRepository: createMemoryWeaponRepository([storedWeapon(1)]),
    })
    await mounted.weapons.ensureLoaded()
    mounted.conditions.selectCustomWeapon(weaponId(1))
    await flushPromises()
    await click(document.querySelector('button[type="submit"]')!)
    const worker = FakeWorker.last
    const build: SolvedBuild = {
      ...makeBuild(),
      decorations: [{ slot: { owner: 'weapon', index: 0 }, decorationId: dc('1') }],
      freeSlots: [{ owner: 'weapon', index: 1 }],
    }
    worker.emit({
      type: 'result',
      requestId: worker.lastSolveId,
      response: { status: 'optimal', builds: [build], elapsedMs: 1 },
    })
    await flushPromises()
    return mounted
  }

  it('要約に「<表示名>（個体差）」、装飾品と空きスロットに武器のスロットの Lv を出す', async () => {
    await show()
    expect(textOf(document.querySelector('#results-heading')!.parentElement)).toContain(
      '武器: 巨戟ブレイド（個体差）',
    )
    const card = document.querySelector<HTMLElement>('#results-heading ~ ul > li')!
    const text = textOf(card)
    expect(text).toContain('武器')
    expect(text).toMatch(/武器\s*Lv3/)
    expect(text).toMatch(/武器\s*Lv1/)
  })

  it('火力は入力した攻撃力・会心率から計算する（検索の後に編集しても変わらない）', async () => {
    const m = await show()
    const before = textOf(
      document.querySelector('#results-heading ~ ul > li section:nth-of-type(1)'),
    )
    const stored = m.weapons.weapons[0]
    await m.weapons.save({ ...stored.payload, attack: 999 }, stored)
    await flushPromises()
    const after = textOf(
      document.querySelector('#results-heading ~ ul > li section:nth-of-type(1)'),
    )
    expect(after).toBe(before)
    expect(m.search.submittedBasis?.damageBase).toEqual({ attack: 200, affinity: 15 })
  })
})

// D15（検索結果の表示は変えない）: 「保存」の slot の有無で見出し行の構造が変わらない
describe('BuildCard の見出しの行', () => {
  const lookup = {
    charm: () => undefined,
    armor: () => undefined,
    weaponSlots: undefined,
    skillKind: () => undefined,
    nameOf: (id: string) => id,
  }
  const mountCard = (slots?: Record<string, string>) =>
    mount(BuildCard, {
      props: { build: makeBuild(), title: '構成 1', lookup, damage: null, showCharm: false },
      slots,
      global: { plugins: [createPinia()] },
    })
  const headerOf = (w: ReturnType<typeof mountCard>) => w.find('div.flex.items-baseline')

  it('[D15] slot が空のとき、見出しの行は baseline のままで、期待値・防御力の群が直接の子になる', () => {
    const w = mountCard()
    const row = headerOf(w)
    expect(row.exists()).toBe(true)
    expect(row.element.children).toHaveLength(2)
    expect(row.element.children[1].className).toContain('flex-wrap')
    w.unmount()
  })

  it('[D15] slot があっても外側は baseline のままで、ボタンだけを縦中央の群に入れる', () => {
    const w = mountCard({ action: '<button>保存</button>' })
    const row = headerOf(w)
    expect(row.element.children).toHaveLength(2)
    const group = row.element.children[1]
    expect(group.className).toContain('items-center')
    expect(group.children[0].className).toContain('flex-wrap')
    expect(group.querySelector('button')).not.toBeNull()
    w.unmount()
  })
})
