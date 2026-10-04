import type { MasterBundle, MasterSkill, SetBonus, SkillId, SkillLevel } from '@swv/data'

/** シリーズ／グループスキルか（レベルは部位数の段で決まり、防具・護石・装飾品のスキル値は足さない） */
export function isSetSkill(skill: MasterSkill | undefined): boolean {
  return skill?.kind === 'series' || skill?.kind === 'group'
}

/** スキルに対応する SetBonus（実データでは 1 スキルに 1 つ） */
export function findSetBonus(master: MasterBundle, skillId: SkillId): SetBonus | undefined {
  return master.setBonuses.find((b) => b.skillId === skillId)
}

/** 部位数が閾値以上の最大の段のレベル。どの段にも届かなければ 0 */
export function setBonusLevel(bonus: SetBonus, pieces: number): number {
  let level = 0
  for (const t of bonus.thresholds) {
    if (pieces >= t.pieces && t.level > level) level = t.level
  }
  return level
}

/** レベル level 以上の段に届くための最小の部位数。段が無ければ undefined */
export function piecesForLevel(bonus: SetBonus, level: number): number | undefined {
  const pieces = bonus.thresholds.filter((t) => t.level >= level).map((t) => t.pieces)
  return pieces.length === 0 ? undefined : Math.min(...pieces)
}

export function skillLevelOf(skills: readonly SkillLevel[], skillId: SkillId): number {
  let sum = 0
  for (const s of skills) if (s.skillId === skillId) sum += s.level
  return sum
}
