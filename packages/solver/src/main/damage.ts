import type { ConditionId, Effect, EffectStat, MasterBundle, MasterSkill, SkillId } from '@swv/data'

/** 武器の攻撃力と会心率（個体差のある武器もそのまま渡せる形） */
export interface DamageBase {
  attack: number
  affinity: number
}

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
}

export const BASE_CRIT_MULTIPLIER = 1.25
export const NEGATIVE_CRIT_MULTIPLIER = 0.75
export const AFFINITY_LIMIT = 100

/** 有効な条件の下で数える効果か（条件が無い効果は常に数える） */
export function isCounted(effect: Effect, active: ReadonlySet<ConditionId>): boolean {
  return effect.conditionId === undefined || active.has(effect.conditionId)
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
  const sums: Record<EffectStat, number> = {
    attack_add: 0,
    attack_mul: 1,
    affinity_add: 0,
    crit_mul: BASE_CRIT_MULTIPLIER,
    element_add: 0,
    element_mul: 1,
  }
  for (const { skillId, level } of skills) {
    for (const effect of effectsAt(byId.get(skillId), level)) {
      if (!isCounted(effect, active)) continue
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
  return {
    attack,
    affinity,
    critMultiplier,
    expectedDamage: attack * critCorrection(affinity, critMultiplier),
  }
}
