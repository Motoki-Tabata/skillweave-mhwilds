import type { MasterDictionary, MasterSkill } from '@swv/data'
import { levelDescription } from '@/lib/skills/description'
import { summarizeEffects } from '@/lib/skills/effectSummary'

export interface SkillLevelTexts {
  /** ja の説明文。無いときは null */
  description: string | null
  /** 補完の文。効果が無いレベルは null */
  summary: string | null
}

/** スキルのあるレベルの説明文と補完（結果の構成カードと D2 のダイアログで共通）。 */
export function skillLevelTexts(
  skill: MasterSkill | undefined,
  dictionary: MasterDictionary | null,
  level: number,
  nameOf: (id: string) => string,
): SkillLevelTexts {
  return {
    description: levelDescription(skill && dictionary?.entries[skill.id], level),
    summary: summarizeEffects(skill?.effectsByLevel[level - 1] ?? [], nameOf),
  }
}
