import type { ConditionId, MasterBundle, SkillId } from '@swv/data'

/**
 * ソルバー（src/main/damage.ts）を呼ばない、期待値の参照実装（decisions.md Q35 の式を別に書いたもの）。
 * levels は発動スキルのレベル（頭打ち後・シリーズ／グループは段のレベル）。
 */
export function referenceDamage(
  master: MasterBundle,
  base: { attack: number; affinity: number },
  levels: ReadonlyMap<SkillId, number>,
  active: readonly ConditionId[],
): number {
  let multiplier = 1
  let addition = 0
  let affinity = base.affinity
  let crit = 1.25
  for (const skill of master.skills) {
    const level = levels.get(skill.id) ?? 0
    if (level < 1) continue
    for (const e of skill.effectsByLevel[level - 1] ?? []) {
      if (e.conditionId !== undefined && !active.includes(e.conditionId)) continue
      if (e.stat === 'attack_mul') multiplier *= e.value
      if (e.stat === 'attack_add') addition += e.value
      if (e.stat === 'affinity_add') affinity += e.value
      if (e.stat === 'crit_mul' && e.value > crit) crit = e.value
    }
  }
  const attack = base.attack * multiplier + addition
  if (affinity > 100) affinity = 100
  if (affinity < -100) affinity = -100
  // 会心率が負なら会心倍率にかかわらず負会心（ダメージ 0.75 倍）
  const gain = affinity >= 0 ? (crit - 1) * affinity : -0.25 * -affinity
  return attack + (attack * gain) / 100
}
