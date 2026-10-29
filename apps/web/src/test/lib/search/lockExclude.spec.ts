import { describe, expect, it } from 'vitest'
import type { ArmorId, MasterBundle } from '@swv/data'
import {
  EXCLUDE_CANDIDATE_LIMIT,
  excludeCandidates,
  fixedCandidates,
} from '@/lib/search/lockExclude'
import { NAMES, armorId, dc, makeBundle } from '../../support/fixtures'

const bundle = makeBundle({ ranks: ['low', 'high', 'master'] })
const nameOf = (id: string): string => NAMES[id] ?? id
// 防具の表示名は「<ランク>の<部位>」とする（テスト用に ID から作る）
const armorName = (id: string): string => {
  const [, rank, part] = id.split(':')
  const rankLabel = { low: '下位', high: '上位', master: 'マスター' }[rank]
  const partLabel = { head: '頭', chest: '胴', arms: '腕', waist: '腰', legs: '脚' }[part]
  return `${rankLabel}の${partLabel}`
}
const names = (id: string): string => (id.startsWith('ar:') ? armorName(id) : nameOf(id))

describe('fixedCandidates', () => {
  // AC-4
  it('AC-4: その部位の全ランクの防具を、ランクの高い順の群で返す', () => {
    const result = fixedCandidates(bundle, names, 'head', '')
    expect(result.groups.map((g) => g.label)).toEqual(['マスター', '上位', '下位'])
    expect(result.groups.map((g) => g.armors.map((a) => a.id))).toEqual([
      [armorId('master', 'head')],
      [armorId('high', 'head')],
      [armorId('low', 'head')],
    ])
    expect(result.count).toBe(3)
  })

  it('マスターに無いランクの群は出さない', () => {
    const two = makeBundle()
    expect(fixedCandidates(two, names, 'head', '').groups.map((g) => g.label)).toEqual([
      '上位',
      '下位',
    ])
  })

  it('名前の一部で絞り込み、一致の無い群は出さない', () => {
    const result = fixedCandidates(bundle, names, 'chest', '上位')
    expect(result.groups.map((g) => g.label)).toEqual(['上位'])
    expect(result.count).toBe(1)
  })
})

describe('excludeCandidates', () => {
  it('入力が空のときは候補を出さない', () => {
    expect(excludeCandidates(bundle, names, '  ', [], [])).toEqual({
      armors: [],
      decorations: [],
      total: 0,
      remaining: 0,
    })
  })

  it('防具は部位→ランクの高い順に並べ、補助の文言を付ける', () => {
    const result = excludeCandidates(bundle, names, 'の', [], [])
    expect(result.armors.slice(0, 4).map((a) => a.id)).toEqual([
      armorId('master', 'head'),
      armorId('high', 'head'),
      armorId('low', 'head'),
      armorId('master', 'chest'),
    ])
    expect(result.armors[0].hint).toBe('頭・マスター')
  })

  it('装飾品を防具の後ろの群に出し、補助に武器用／防具用と Lv を付ける', () => {
    const result = excludeCandidates(bundle, names, '攻撃珠', [], [])
    expect(result.armors).toEqual([])
    expect(result.decorations).toEqual([{ id: dc('1'), name: '攻撃珠【２】', hint: '防具用 Lv2' }])
  })

  it('除外済みは候補に出さない', () => {
    const excluded: ArmorId[] = [armorId('high', 'head')]
    const result = excludeCandidates(bundle, names, '上位の頭', excluded, [])
    expect(result.armors).toEqual([])
    expect(excludeCandidates(bundle, names, '攻撃珠', [], [dc('1')]).decorations).toEqual([])
  })

  it('先頭 50 件で打ち切り、残りの件数を返す', () => {
    const base = makeBundle()
    const many: MasterBundle = {
      ...base,
      decorations: Array.from({ length: 60 }, (_, i) => ({
        id: dc(`m${i}`),
        target: 'weapon' as const,
        slotLevel: 1 as const,
        skills: [],
      })),
    }
    const result = excludeCandidates(many, (id) => id, 'dc:m', [], [])
    expect(result.decorations).toHaveLength(EXCLUDE_CANDIDATE_LIMIT)
    expect(result.total).toBe(60)
    expect(result.remaining).toBe(10)
    expect(result.decorations[0].hint).toBe('武器用 Lv1')
  })
})
