import highsLoader, { type Highs } from 'highs'
import type { MasterBundle } from '@swv/data'
import { beforeAll, describe, expect, it } from 'vitest'
import { evaluateDamage } from '../main/damage'
import { makeRequest, skill } from './support/builders'
import { solve } from './support/harness'
import { loadRealMaster } from './support/realMaster'

/** 037: 新しい種類の効果（防御・耐性・属性・状態異常など）を数えないことの確認（AC-7・AC-8） */

const COUNTED = new Set(['attack_add', 'attack_mul', 'affinity_add', 'crit_mul'])
const TIMEOUT_MS = 60_000

const SKILL = {
  attack: 'sk:1359821952', // 攻撃力の効果（防具。attack_add）
  affinity: 'sk:-397570464', // 会心率の効果（防具。affinity_add）
  defense: 'sk:1077686656', // 防御・耐性の効果（防具。defense_add・defense_mul・resistance_add）
} as const

let highs: Highs
let master: MasterBundle
let stripped: MasterBundle

/** 数える 4 種以外の効果を、各スキルの各レベルから除いたマスター（レベルの配列の長さは保つ） */
function stripNewEffects(source: MasterBundle): MasterBundle {
  return {
    ...source,
    skills: source.skills.map((s) => ({
      ...s,
      effectsByLevel: s.effectsByLevel.map((level) => level.filter((e) => COUNTED.has(e.stat))),
    })),
  }
}

beforeAll(async () => {
  highs = await highsLoader()
  master = loadRealMaster()
  stripped = stripNewEffects(master)
})

describe('新しい種類の効果を除いたマスターとの比較', () => {
  it('前提: 現行のマスターには新しい種類の効果があり、除いたマスターには無い', () => {
    const stats = (m: MasterBundle) =>
      new Set(m.skills.flatMap((s) => s.effectsByLevel.flat().map((e) => e.stat)))
    expect([...stats(master)].some((s) => !COUNTED.has(s))).toBe(true)
    expect([...stats(stripped)].every((s) => COUNTED.has(s))).toBe(true)
  })

  it('[AC-7] 新しい種類の効果しか持たないスキルは、火力を変えない', () => {
    const base = { attack: 200, affinity: 10 }
    const skills = master.skills.map((s) => ({ skillId: s.id, level: s.maxLevel }))
    const newOnly = master.skills
      .filter((s) => s.effectsByLevel.flat().every((e) => !COUNTED.has(e.stat)))
      .map((s) => ({ skillId: s.id, level: s.maxLevel }))
    expect(newOnly.length).toBeGreaterThan(0)
    expect(evaluateDamage(master, base, newOnly)).toEqual(evaluateDamage(master, base, []))
    // 全スキルを最大レベルで付けても、除いたマスターと同じ火力になる
    expect(evaluateDamage(master, base, skills)).toEqual(evaluateDamage(stripped, base, skills))
  })

  it(
    '[AC-7] 期待値の最大化の検索結果（構成と並び）と火力が、除いたマスターと一致する',
    async () => {
      const required = [skill(SKILL.attack, 3), skill(SKILL.affinity, 2), skill(SKILL.defense, 1)]
      const run = (m: MasterBundle) =>
        solve(
          highs,
          m,
          makeRequest(m, {
            required,
            objective: { kind: 'maximize', metric: 'expectedDamage' },
            maxResults: 5,
            timeoutMs: 30_000,
          }),
        )
      const [actual, expected] = [await run(master), await run(stripped)]
      expect(actual.builds.length).toBeGreaterThan(0)
      expect(actual.status).toBe(expected.status)
      expect(actual.builds).toEqual(expected.builds)
      const base = { attack: 0, affinity: 0 }
      for (const build of actual.builds) {
        expect(evaluateDamage(master, base, build.skills)).toEqual(
          evaluateDamage(stripped, base, build.skills),
        )
      }
    },
    TIMEOUT_MS,
  )

  it(
    '[AC-8] 防御力の最大化は防具の防御力の合計で並び、防御力の効果を数えない',
    async () => {
      const required = [skill(SKILL.defense, 1)]
      const run = (m: MasterBundle) =>
        solve(
          highs,
          m,
          makeRequest(m, {
            required,
            objective: { kind: 'maximize', metric: 'defense' },
            maxResults: 5,
            timeoutMs: 30_000,
          }),
        )
      const [actual, expected] = [await run(master), await run(stripped)]
      expect(actual.builds.length).toBeGreaterThan(0)
      expect(actual.builds).toEqual(expected.builds)
      const defenseOf = new Map(master.armors.map((a) => [a.id, a.defense]))
      for (const build of actual.builds) {
        const sum = Object.values(build.armor).reduce(
          (total, id) => total + (id === null ? 0 : (defenseOf.get(id) ?? 0)),
          0,
        )
        expect(build.score).toBe(sum)
      }
    },
    TIMEOUT_MS,
  )
})
