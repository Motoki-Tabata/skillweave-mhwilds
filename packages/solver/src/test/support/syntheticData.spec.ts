import { describe, expect, it } from 'vitest'
import {
  generateData,
  makeFeasibleRequired,
  makeInfeasibleRequired,
  MHDB_COUNTS,
  PARTS,
} from './syntheticData'

describe('合成データ生成器', () => {
  // 受入基準 8
  it('[AC8] 同じシードから同じデータを生成する', () => {
    expect(generateData(7)).toEqual(generateData(7))
  })

  it('[AC8] 違うシードからは違うデータを生成する', () => {
    expect(generateData(7)).not.toEqual(generateData(8))
  })

  it('[AC8] 同じシードから同じケース（必須スキル）を生成する', () => {
    const data = generateData(7)
    expect(makeFeasibleRequired(data, 1, 6)).toEqual(makeFeasibleRequired(data, 1, 6))
    expect(makeInfeasibleRequired(data, 1, 6)).toEqual(makeInfeasibleRequired(data, 1, 6))
  })

  it('[AC8] 解なしのケースの下限は現実的な範囲（Lv 7 以下）で、スキルは重複しない', () => {
    const data = generateData(7)
    for (const k of [3, 6, 10]) {
      const required = makeInfeasibleRequired(data, 1, k)
      expect(required).toHaveLength(k)
      expect(required.every((r) => r.level >= 1 && r.level <= 7)).toBe(true)
      expect(new Set(required.map((r) => r.skillId)).size).toBe(k)
    }
  })

  it('[AC8] 件数が decisions.md Q2 の MHDB 実測値（上位防具 582・装飾品 361・護石 187）に合う', () => {
    const data = generateData(7)
    expect(data.armors).toHaveLength(582)
    for (const part of PARTS) {
      expect(data.armors.filter((a) => a.part === part)).toHaveLength(
        MHDB_COUNTS.armorsByPart[part],
      )
    }
    expect(data.decorations).toHaveLength(361)
    expect(data.decorations.filter((d) => d.target === 'weapon')).toHaveLength(295)
    expect(data.decorations.filter((d) => d.target === 'armor')).toHaveLength(66)
    expect(data.decorations.filter((d) => d.skills.length === 2)).toHaveLength(173)
    expect(data.charms).toHaveLength(187)
    expect(data.weaponSkillIds).toHaveLength(66)
    expect(data.armorSkillIds).toHaveLength(71)
  })

  it('[AC8] スロットは Lv1〜3、防具のスキル数の平均は 2.97 に近い', () => {
    const data = generateData(7)
    const levels = [
      ...data.armors.flatMap((a) => a.slots),
      ...data.charms.flatMap((c) => c.slots),
    ].map((s) => s.level)
    expect(Math.min(...levels)).toBe(1)
    expect(Math.max(...levels)).toBe(3)
    expect(data.decorations.every((d) => d.slotLevel >= 1 && d.slotLevel <= 3)).toBe(true)
    const mean = data.armors.reduce((sum, a) => sum + a.skills.length, 0) / data.armors.length
    expect(Math.abs(mean - 2.97)).toBeLessThan(0.2)
  })
})
