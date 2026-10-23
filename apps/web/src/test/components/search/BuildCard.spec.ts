import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import type { SolvedBuild } from '@swv/solver'
import type { CharmPayload } from '@/lib/charms/types'
import { createMemoryCharmRepository } from '../../support/charmRepository'
import { charmId, storedCharm } from '../../support/charms'
import { FakeWorker, dc, makeBuild, sk, wp } from '../../support/fixtures'
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
  async function showBuilds(builds: SolvedBuild[]): Promise<Mounted> {
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
    expect(textOf(card(0).querySelector('p'))).toBe('防御力 20')
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
      expect(headings.slice(0, 3)).toEqual(['防具', '護石', '装飾品'])
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
