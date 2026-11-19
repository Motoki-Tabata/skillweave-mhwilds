import type { ConditionId, Effect, EffectStat, MasterBundle, MasterSkill, SkillId } from '@swv/data'

/** 火力の計算で数える効果の種類。これ以外の種類の効果は数えない */
type CountedStat = Extract<EffectStat, 'attack_add' | 'attack_mul' | 'affinity_add' | 'crit_mul'>

/** 武器の攻撃力と会心率（個体差のある武器もそのまま渡せる形） */
export interface DamageBase {
  attack: number
  affinity: number
  /** 武器の武器種。省略は「分からない」で、`weaponTypes` を持つ効果を数えない */
  weaponType?: string
  /** 武器の属性（マスターの単位）。省略は無属性 */
  element?: { type: string; value: number }
}

/** 武器の属性の種類。5 属性と状態異常のどちらでもない種類は「属性が分からない」として扱う */
export const ELEMENT_TYPES = ['fire', 'water', 'thunder', 'ice', 'dragon'] as const
export const STATUS_TYPES = ['poison', 'paralysis', 'sleep', 'blastblight'] as const

export function isElementType(type: string): boolean {
  return (ELEMENT_TYPES as readonly string[]).includes(type)
}

function isStatusType(type: string): boolean {
  return (STATUS_TYPES as readonly string[]).includes(type)
}

/** 効果の種類が武器の属性の種類に合う（効果の `element` が一致、または省略） */
export function elementMatches(effect: Effect, type: string): boolean {
  return effect.element === undefined || effect.element === type
}

/** 属性値の計算結果。丸めない。状態異常は蓄積値だけ（会心はかけない） */
export type ElementStats =
  | { kind: 'element'; type: string; value: number; critMultiplier: number; expected: number }
  | { kind: 'status'; type: string; value: number }

/** 発動スキル。`SolvedBuild.skills` をそのまま渡せる */
export interface ActiveSkill {
  skillId: SkillId
  level: number
}

/** 期待値の計算結果。どの値も丸めない（affinity は −100〜100 に丸めた値） */
export interface DamageStats {
  attack: number
  affinity: number
  critMultiplier: number
  expectedDamage: number
  /** 属性が無い・分からないときはプロパティごと持たない */
  element?: ElementStats
}

export const BASE_CRIT_MULTIPLIER = 1.25
export const NEGATIVE_CRIT_MULTIPLIER = 0.75
export const AFFINITY_LIMIT = 100

/** 有効な条件の下で数える効果か（条件が無い効果は常に数える） */
export function isCounted(
  effect: Effect,
  active: ReadonlySet<ConditionId>,
  weaponType: string | undefined,
): boolean {
  if (effect.conditionId !== undefined && !active.has(effect.conditionId)) return false
  if (effect.weaponTypes === undefined) return true
  return weaponType !== undefined && effect.weaponTypes.includes(weaponType)
}

/** レベル level の効果（`effectsByLevel[level - 1]`）。範囲外は効果なし */
export function effectsAt(skill: MasterSkill | undefined, level: number): readonly Effect[] {
  if (skill === undefined || !Number.isInteger(level) || level < 1) return []
  return skill.effectsByLevel[level - 1] ?? []
}

/** 会心率を −100〜100 に丸める */
export function clampAffinity(affinity: number): number {
  return Math.min(AFFINITY_LIMIT, Math.max(-AFFINITY_LIMIT, affinity))
}

/** 会心補正。会心率が負のときは会心倍率にかかわらず 0.75 倍側で計算する */
export function critCorrection(affinity: number, critMultiplier: number): number {
  const rate = affinity / 100
  return rate >= 0 ? 1 + rate * (critMultiplier - 1) : 1 + rate * (1 - NEGATIVE_CRIT_MULTIPLIER)
}

/**
 * 構成の期待値（物理）を計算する純関数（decisions.md Q35）。
 * 攻撃力 = 武器の攻撃力 × attack_mul の積 + attack_add の和、会心率 = 武器の会心率 + affinity_add の和、
 * 会心倍率 = 有効な crit_mul の最大（無ければ 1.25）。マスターに無い条件 ID は一致しないだけで例外は投げない。
 */
export function evaluateDamage(
  master: MasterBundle,
  base: DamageBase,
  skills: readonly ActiveSkill[],
  activeConditionIds?: readonly ConditionId[],
): DamageStats {
  const active = new Set<ConditionId>(activeConditionIds ?? [])
  const byId = new Map(master.skills.map((s) => [s.id, s]))
  const sums: Record<CountedStat, number> = {
    attack_add: 0,
    attack_mul: 1,
    affinity_add: 0,
    crit_mul: BASE_CRIT_MULTIPLIER,
  }
  for (const { skillId, level } of skills) {
    for (const effect of effectsAt(byId.get(skillId), level)) {
      if (!isCounted(effect, active, base.weaponType)) continue
      if (effect.stat === 'attack_add' || effect.stat === 'affinity_add') {
        sums[effect.stat] += effect.value
      } else if (effect.stat === 'attack_mul') {
        sums.attack_mul *= effect.value
      } else if (effect.stat === 'crit_mul') {
        sums.crit_mul = Math.max(sums.crit_mul, effect.value)
      }
    }
  }
  const attack = base.attack * sums.attack_mul + sums.attack_add
  const affinity = clampAffinity(base.affinity + sums.affinity_add)
  const critMultiplier = sums.crit_mul
  const stats: DamageStats = {
    attack,
    affinity,
    critMultiplier,
    expectedDamage: attack * critCorrection(affinity, critMultiplier),
  }
  const element = evaluateElement(byId, base, skills, active, affinity)
  return element === undefined ? stats : { ...stats, element }
}

interface ElementSums {
  add: number
  mul: number
  crit: number
}

/** 武器の属性に合う有効な効果の合計。5 属性は element_*、状態異常は status_* だけを数える */
function sumElementEffects(
  byId: ReadonlyMap<SkillId, MasterSkill>,
  skills: readonly ActiveSkill[],
  base: DamageBase,
  type: string,
  isElement: boolean,
  active: ReadonlySet<ConditionId>,
): ElementSums {
  const addStat = isElement ? 'element_add' : 'status_add'
  const mulStat = isElement ? 'element_mul' : 'status_mul'
  const sums: ElementSums = { add: 0, mul: 1, crit: 1 }
  for (const { skillId, level } of skills) {
    for (const effect of effectsAt(byId.get(skillId), level)) {
      if (!isCounted(effect, active, base.weaponType) || !elementMatches(effect, type)) continue
      if (effect.stat === addStat) sums.add += effect.value
      else if (effect.stat === mulStat) sums.mul *= effect.value
      else if (isElement && effect.stat === 'element_crit_mul') {
        sums.crit = Math.max(sums.crit, effect.value)
      }
    }
  }
  return sums
}

/** 属性値・属性期待値・蓄積値（AC-1〜AC-4）。affinity は丸め済みの会心率 */
function evaluateElement(
  byId: ReadonlyMap<SkillId, MasterSkill>,
  base: DamageBase,
  skills: readonly ActiveSkill[],
  active: ReadonlySet<ConditionId>,
  affinity: number,
): ElementStats | undefined {
  const weaponElement = base.element
  if (weaponElement === undefined) return undefined
  const { type } = weaponElement
  const isElement = isElementType(type)
  if (!isElement && !isStatusType(type)) return undefined
  const sums = sumElementEffects(byId, skills, base, type, isElement, active)
  const value = weaponElement.value * sums.mul + sums.add
  if (!isElement) return { kind: 'status', type, value }
  const correction = affinity > 0 ? 1 + (affinity / 100) * (sums.crit - 1) : 1
  return { kind: 'element', type, value, critMultiplier: sums.crit, expected: value * correction }
}
