import { describe, expect, it } from 'vitest'
import {
  buildCandidates,
  editDistance,
  matchSkillName,
  normalizeText,
  type SkillCandidate,
} from '@/lib/ocr/match'
import { bundle, dictionary, skillByName } from './masterFixture'

const candidates = buildCandidates(bundle, dictionary)

describe('buildCandidates', () => {
  it('護石に付くスキル（armor・weapon）だけを、辞書の名前つきで候補にする', () => {
    expect(candidates.length).toBeGreaterThan(100)
    const kinds = new Set(candidates.map((c) => bundle.skills.find((s) => s.id === c.id)?.kind))
    expect([...kinds].sort()).toEqual(['armor', 'weapon'])
    expect(new Set(candidates.map((c) => c.name)).size).toBe(candidates.length)
  })
})

describe('normalizeText / editDistance', () => {
  it('NFKC にして空白を除く', () => {
    expect(normalizeText('体力回復量ＵＰ')).toBe('体力回復量UP')
    expect(normalizeText(' 体力回復量 U P ')).toBe('体力回復量UP')
  })

  it('編集距離を返す', () => {
    expect(editDistance('', 'abc')).toBe(3)
    expect(editDistance('納刀衡', '納刀術')).toBe(1)
    expect(editDistance('same', 'same')).toBe(0)
  })
})

describe('matchSkillName（AC-2）', () => {
  it('半角で認識した名前を、全角の辞書名と距離 0 で照合する', () => {
    expect(matchSkillName('体力回復量UP', candidates)?.id).toBe(skillByName('体力回復量ＵＰ').id)
  })

  it('1文字の誤認識を、3文字以上の名前ならしきい値内で照合する', () => {
    expect(matchSkillName('納刀衡', candidates)?.id).toBe(skillByName('納刀術').id)
  })

  it('2文字の名前は完全一致だけを受け、1文字違いは null（AC-3）', () => {
    expect(matchSkillName('体衛', candidates)).toBeNull()
    expect(matchSkillName('体術', candidates)?.id).toBe(skillByName('体術').id)
  })

  it('近い名前が見つからないときは null（AC-3）', () => {
    expect(matchSkillName('ABCDEFG', candidates)).toBeNull()
    expect(matchSkillName('', candidates)).toBeNull()
  })

  it('最小の距離が同点で複数あるときは null（AC-3）', () => {
    const tied: SkillCandidate[] = [
      { id: 'a' as SkillCandidate['id'], name: 'あいうえ', maxLevel: 1 },
      { id: 'b' as SkillCandidate['id'], name: 'あいうお', maxLevel: 1 },
    ]
    expect(matchSkillName('あいうか', tied)).toBeNull()
    expect(matchSkillName('あいうえ', tied)?.id).toBe('a')
  })
})
