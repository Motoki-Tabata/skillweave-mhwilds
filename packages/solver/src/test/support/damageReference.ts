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
  weaponType?: string,
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
      if (
        e.weaponTypes !== undefined &&
        !(weaponType !== undefined && e.weaponTypes.includes(weaponType))
      ) {
        continue
      }
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

/**
 * 5 属性の武器の属性期待値の参照実装（spec AC-1・AC-2 の式を別に書いたもの。ソルバーを呼ばない）。
 * 効果は、発動条件・武器種を通り、`element` が武器の属性と一致または省略のものだけ数える。
 * 会心率は affinity_add を常にすべて数え、−100〜100 に丸める（ソルバーの「効かないときは省く」最適化に頼らない）。
 */
export function referenceElement(
  master: MasterBundle,
  base: { affinity: number; element: { type: string; value: number } },
  levels: ReadonlyMap<SkillId, number>,
  active: readonly ConditionId[],
  weaponType?: string,
): number {
  let multiplier = 1
  let addition = 0
  let affinity = base.affinity
  let crit = 1
  for (const skill of master.skills) {
    const level = levels.get(skill.id) ?? 0
    if (level < 1) continue
    for (const e of skill.effectsByLevel[level - 1] ?? []) {
      if (e.conditionId !== undefined && !active.includes(e.conditionId)) continue
      if (
        e.weaponTypes !== undefined &&
        !(weaponType !== undefined && e.weaponTypes.includes(weaponType))
      ) {
        continue
      }
      if (e.stat === 'affinity_add') affinity += e.value
      if (e.element !== undefined && e.element !== base.element.type) continue
      if (e.stat === 'element_mul') multiplier *= e.value
      if (e.stat === 'element_add') addition += e.value
      if (e.stat === 'element_crit_mul' && e.value > crit) crit = e.value
    }
  }
  const value = base.element.value * multiplier + addition
  const rate = Math.min(100, Math.max(-100, affinity))
  return rate > 0 ? value * (1 + (rate / 100) * (crit - 1)) : value
}
