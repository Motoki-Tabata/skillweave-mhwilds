import highsLoader, { type Highs } from 'highs'
import type { MasterBundle } from '@swv/data'
import { beforeAll, describe, expect, it } from 'vitest'
import { evaluateDamage } from '../main/damage'
import type { SolverRequest } from '../main/request'
import { conditionId, makeRequest, skill, slot, uuid, weaponId } from './support/builders'
import { solve } from './support/harness'
import { loadRealMaster } from './support/realMaster'

/** 037: 新しい種類の効果（防御・耐性・属性・状態異常など）を数えないことの確認（AC-7・AC-8） */

const COUNTED = new Set(['attack_add', 'attack_mul', 'affinity_add', 'crit_mul'])
const TIMEOUT_MS = 60_000

const SKILL = {
  attack: 'sk:1359821952', // 攻撃力（attack_add。cd:resentment 条件付き）
  affinity: 'sk:-397570464', // 会心率（affinity_add。cd:weak_point・cd:wound 条件付き）
  fire: 'sk:-562534336', // 火属性攻撃強化（element_add・element_mul）
  poison: 'sk:-1716324608', // 毒属性強化（status_add・status_mul）
  defense: 'sk:1077686656', // 防御（defense_add・defense_mul・resistance_add）
  fireRes: 'sk:1425756032', // 火耐性（resistance_add・defense_add）
} as const

// 数える効果（攻撃力・会心率）の発動条件。渡さないと条件付きの効果は数えられない
const CONDITIONS = ['cd:resentment', 'cd:weak_point', 'cd:wound'] as const

// plan D12 の必須スキルを全部同時に要求すると解が出ない場合があるため、
// 火属性・毒属性の装飾品は武器用の Lv1〜3 の枠にだけ入るため、枠を持つ個体差のある武器で解く
const slotWeapon = (m: MasterBundle): SolverRequest['weapon'] => ({
  kind: 'custom',
  id: uuid('custom'),
  baseWeaponId: m.weapons[0]?.id ?? weaponId(''),
  attack: 200,
  affinity: 10,
  slots: [slot(3, 'weapon'), slot(3, 'weapon'), slot(3, 'weapon')],
  skills: [],
  setBonusIds: [],
})

// 要求を分ける。新しい種類のスキルは 1 つずつ要求し、残りの枠は期待値の最大化が
// 数える効果（攻撃力・会心率）のスキルで埋める（スコアが 0 でないことで確かめる）
const SEARCH_CASES = [
  { name: '数える効果の 2 つ', required: [skill(SKILL.attack, 3), skill(SKILL.affinity, 2)] },
  { name: '火属性攻撃強化 Lv3', required: [skill(SKILL.fire, 3)] },
  { name: '毒属性強化 Lv3', required: [skill(SKILL.poison, 3)] },
  { name: '防御 Lv7', required: [skill(SKILL.defense, 7)] },
  { name: '火耐性 Lv3', required: [skill(SKILL.fireRes, 3)] },
]

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
    // 数える側が効いている: 条件を渡すと攻撃力の効果で攻撃力が上がる
    const conds = CONDITIONS.map((c) => conditionId(c))
    const attackMax = [skill(SKILL.attack, 5)]
    expect(evaluateDamage(master, base, attackMax, conds).attack).toBeGreaterThan(base.attack)
    // 全スキルを最大レベルで付けても、除いたマスターと同じ火力になる
    expect(evaluateDamage(master, base, skills)).toEqual(evaluateDamage(stripped, base, skills))
  })

  it(
    '[AC-7] 期待値の最大化の検索結果（構成と並び）と火力が、除いたマスターと一致する',
    async () => {
      const activeConditionIds = CONDITIONS.map((c) => conditionId(c))
      const base = { attack: 200, affinity: 10 }
      for (const { name, required } of SEARCH_CASES) {
        const run = (m: MasterBundle) =>
          solve(
            highs,
            m,
            makeRequest(m, {
              weapon: slotWeapon(m),
              required,
              objective: { kind: 'maximize', metric: 'expectedDamage' },
              activeConditionIds,
              maxResults: 3,
              timeoutMs: 30_000,
            }),
          )
        const [actual, expected] = [await run(master), await run(stripped)]
        expect(actual.builds.length, name).toBeGreaterThan(0)
        expect(actual.status, name).toBe(expected.status)
        expect(actual.builds, name).toEqual(expected.builds)
        // 数える効果が効いている（検索のスコアが 0 でない）
        expect(actual.builds[0]?.score, name).not.toBe(0)
        for (const build of actual.builds) {
          expect(evaluateDamage(master, base, build.skills, activeConditionIds), name).toEqual(
            evaluateDamage(stripped, base, build.skills, activeConditionIds),
          )
        }
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
