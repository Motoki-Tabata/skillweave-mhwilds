import { describe, expect, it } from 'vitest'
import type { MasterBundle, Slot } from '@swv/data'
import { matchCharm } from '@/lib/charms/match'
import type { CharmPayload } from '@/lib/charms/types'
import { NAMES, makeBundle, sk } from '../../support/fixtures'

const slot = (target: Slot['target'], level: Slot['level']): Slot => ({ target, level })
const nameOf = (id: string) => NAMES[id] ?? id

// テスト用の抽選テーブル（実データではない）。レア8 に2つのパターン、レア7 は無し。
function tableBundle(): MasterBundle {
  const bundle = makeBundle()
  bundle.appraisedCharm = {
    groups: [
      {
        group: 'A',
        skills: [
          { skillId: sk('a1'), level: 1 },
          { skillId: sk('a1'), level: 2 },
          { skillId: sk('w1'), level: 1 },
        ],
      },
      { group: 'B', skills: [{ skillId: sk('a2'), level: 1 }] },
      { group: 'C', skills: [{ skillId: sk('w1'), level: 3 }] },
    ],
    patterns: [
      {
        rarity: 8,
        skillGroups: ['A', 'B', null],
        slotPatterns: [[slot('weapon', 1)], [slot('weapon', 1), slot('armor', 2)]],
      },
      { rarity: 8, skillGroups: ['C', null, null], slotPatterns: [[]] },
    ],
  }
  return bundle
}

const charm = (over: Partial<CharmPayload>): CharmPayload => ({
  rarity: 8,
  skills: [{ skillId: sk('a1'), level: 2 }],
  slots: [slot('weapon', 1)],
  ...over,
})

// 受入基準 6・7（抽選テーブルとの照合）
describe('matchCharm', () => {
  const bundle = tableBundle()
  const run = (c: CharmPayload) => matchCharm(c, bundle, nameOf)

  it('合格: スキルとスロットが1つのパターンにそろう', () => {
    expect(run(charm({}))).toEqual({ status: 'pass' })
    expect(
      run(
        charm({
          skills: [
            { skillId: sk('a1'), level: 1 },
            { skillId: sk('a2'), level: 1 },
          ],
          slots: [slot('weapon', 1), slot('armor', 2)],
        }),
      ),
    ).toEqual({ status: 'pass' })
  })

  it('合格: 2つめのパターンだけに合う場合（複数パターンのどれかで合格）', () => {
    expect(run(charm({ skills: [{ skillId: sk('w1'), level: 3 }], slots: [] }))).toEqual({
      status: 'pass',
    })
  })

  it('合格: 護石が持つスキルだけを照らす（パターンの枠より少なくてよい）', () => {
    expect(run(charm({ skills: [] }))).toEqual({ status: 'pass' })
  })

  it('未検査: そのレア度のパターンが1つも無い', () => {
    expect(run(charm({ rarity: 7 }))).toEqual({ status: 'unchecked' })
    expect(matchCharm(charm({}), makeBundle(), nameOf)).toEqual({ status: 'unchecked' })
  })

  it('合わない点1: 枠が無い（どのパターンにもスキル<i>の枠が無い）', () => {
    const result = run(
      charm({
        skills: [
          { skillId: sk('a1'), level: 1 },
          { skillId: sk('a2'), level: 1 },
          { skillId: sk('a1'), level: 2 },
        ],
      }),
    )
    expect(result).toMatchObject({ status: 'mismatch' })
    expect((result as { issues: string[] }).issues).toContain(
      'スキル3の枠は、レア8にはありません。',
    )
  })

  it('合わない点2: 枠はあるが、そのスキルとレベルが枠のグループに無い', () => {
    const result = run(charm({ skills: [{ skillId: sk('a1'), level: 3 }] }))
    expect(result).toEqual({
      status: 'mismatch',
      issues: ['スキル1「攻撃 Lv3」は、レア8のスキル1の枠に出ません。'],
    })
  })

  it('合わない点3: スロットの並びがどのパターンにも無い（並びは「武器用 Lv1・防具用 Lv2」の形）', () => {
    const result = run(charm({ slots: [slot('armor', 2), slot('weapon', 1)] }))
    expect(result).toEqual({
      status: 'mismatch',
      issues: ['スロットの並び「防具用 Lv2・武器用 Lv1」は、レア8にありません。'],
    })
  })

  it('合わない点3: スロットの並びが空なら「なし」', () => {
    const only = tableBundle()
    only.appraisedCharm.patterns = only.appraisedCharm.patterns.slice(0, 1)
    expect(matchCharm(charm({ slots: [] }), only, nameOf)).toEqual({
      status: 'mismatch',
      issues: ['スロットの並び「なし」は、レア8にありません。'],
    })
  })

  it('合わない点4: 個々には合うが1つのパターンにそろわない', () => {
    // a1 Lv2 は P1 のスキル1、スロット無しは P2 のスロット。それぞれ単独では存在する。
    const result = run(charm({ slots: [] }))
    expect(result).toEqual({
      status: 'mismatch',
      issues: ['スキルとスロットの組み合わせが、レア8のどのパターンにも当てはまりません。'],
    })
  })

  it('合わない点は複数まとめて出す（スキル→スロットの順）', () => {
    const result = run(
      charm({ skills: [{ skillId: sk('a2'), level: 4 }], slots: [slot('armor', 3)] }),
    )
    expect(result).toEqual({
      status: 'mismatch',
      issues: [
        'スキル1「ガード Lv4」は、レア8のスキル1の枠に出ません。',
        'スロットの並び「防具用 Lv3」は、レア8にありません。',
      ],
    })
  })
})
