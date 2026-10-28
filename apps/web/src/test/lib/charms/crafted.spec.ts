import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { MasterBundle, MasterCharm } from '@swv/data'
import { craftedSolverCharms, isCraftedCharmId } from '@/lib/charms/crafted'
import { CRAFTED_CHARMS } from '../../support/fixtures'

const master = JSON.parse(
  readFileSync(
    join(
      import.meta.dirname,
      `../../../../../../packages/data/dist/master-${__SWV_MASTER__.version}.json`,
    ),
    'utf-8',
  ),
) as MasterBundle

describe('isCraftedCharmId', () => {
  it('ch: で始まる ID が生産護石、UUID は鑑定護石', () => {
    expect(isCraftedCharmId('ch:-1137475456:2')).toBe(true)
    expect(isCraftedCharmId('018f0000-0000-7000-8000-000000000001')).toBe(false)
  })
})

// AC-3（系統ごとに最上位ランクの1件）
describe('craftedSolverCharms', () => {
  it('系統ごとに最上位ランクの1件だけを返す。ランク1つだけの系統はそのまま', () => {
    expect(craftedSolverCharms(CRAFTED_CHARMS).map((c) => c.id)).toEqual(['ch:-1:2', 'ch:-2:1'])
  })

  it('負の gameId・ランクが並び順に依らず、最上位の件の位置の順に返す', () => {
    const shuffled = [CRAFTED_CHARMS[1], CRAFTED_CHARMS[2], CRAFTED_CHARMS[0]]
    expect(craftedSolverCharms(shuffled).map((c) => c.id)).toEqual(['ch:-1:2', 'ch:-2:1'])
    expect(craftedSolverCharms(shuffled)).toEqual(craftedSolverCharms(shuffled))
  })

  it('SolverCharm はマスターの写しで、元を共有しない', () => {
    const [result] = craftedSolverCharms(CRAFTED_CHARMS)
    expect(result).toEqual({
      id: 'ch:-1:2',
      rarity: 7,
      skills: [{ skillId: 'sk:a1', level: 2 }],
      slots: [{ target: 'weapon', level: 1 }],
    })
    expect(result.skills[0]).not.toBe(CRAFTED_CHARMS[1].skills[0])
  })

  it('護石が無ければ空', () => {
    expect(craftedSolverCharms([])).toEqual([])
  })
})

// AC-9（上位ランクが下位ランクを包含する前提を、現行のマスターで示す）
describe('現行のマスターの生産護石', () => {
  const rankOf = (id: string) => Number(id.slice(id.lastIndexOf(':') + 1))
  const familyOf = (id: string) => id.slice(0, id.lastIndexOf(':'))
  const sortedLevels = (charm: MasterCharm) => charm.slots.map((s) => s.level).sort((a, b) => b - a)

  it('どの系統でも、最上位ランクが下位ランクのスキルとスロットを包含する', () => {
    const families = new Map<string, MasterCharm[]>()
    for (const charm of master.charms) {
      families.set(familyOf(charm.id), [...(families.get(familyOf(charm.id)) ?? []), charm])
    }
    expect(families.size).toBeGreaterThan(0)
    for (const [family, members] of families) {
      const top = members.reduce((a, b) => (rankOf(b.id) > rankOf(a.id) ? b : a))
      for (const lower of members) {
        for (const skill of lower.skills) {
          const same = top.skills.find((s) => s.skillId === skill.skillId)
          expect(same?.level ?? 0, `${family} ${lower.id} のスキル`).toBeGreaterThanOrEqual(
            skill.level,
          )
        }
        const topSlots = sortedLevels(top)
        sortedLevels(lower).forEach((level, i) => {
          expect(topSlots[i] ?? 0, `${family} ${lower.id} のスロット`).toBeGreaterThanOrEqual(level)
        })
      }
    }
  })

  it('絞り込みは系統ごとに1件', () => {
    const families = new Set(master.charms.map((c) => familyOf(c.id)))
    expect(craftedSolverCharms(master.charms)).toHaveLength(families.size)
  })
})
