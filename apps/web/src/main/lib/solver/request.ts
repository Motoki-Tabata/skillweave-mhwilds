import type { ArmorId, ArmorRank, ConditionId, MasterBundle, SkillLevel, WeaponId } from '@swv/data'
import type { Objective, SolverCharm, SolverRequest } from '@swv/solver'
import type { ObjectiveChoice } from '@/constants/labels'
import { SOLVE_TIMEOUT_MS } from '@/constants/search'

/** 画面で入力した検索条件（武器が選ばれているもの）。 */
export interface SearchConditions {
  weaponId: WeaponId
  required: SkillLevel[]
  objective: ObjectiveChoice
  maxResults: number
  ranks: ArmorRank[]
  /** オンの発動条件の ID（目的にかかわらず要求に入れる。オンが無ければ空） */
  activeConditionIds: ConditionId[]
  /** 護石の候補（構造上の制約を満たすもの。空なら護石なしで解く） */
  charms: SolverCharm[]
}

export function toObjective(choice: ObjectiveChoice): Objective {
  switch (choice) {
    case 'feasible':
      return { kind: 'feasible' }
    case 'defense':
      return { kind: 'maximize', metric: 'defense' }
    case 'freeSlots':
      return { kind: 'maximize', metric: 'freeSlots' }
    case 'expectedDamage':
      return { kind: 'maximize', metric: 'expectedDamage' }
  }
}

/** 選ばれていないランクの防具の ID（候補から外す指定。全ランクを選んだときは空）。 */
export function excludedArmorIds(bundle: MasterBundle, ranks: ArmorRank[]): ArmorId[] {
  return bundle.armors.filter((armor) => !ranks.includes(armor.rank)).map((armor) => armor.id)
}

/** 検索条件をソルバーの要求に変換する。 */
export function buildSolverRequest(
  bundle: MasterBundle,
  conditions: SearchConditions,
): SolverRequest {
  return {
    masterVersion: bundle.version,
    weapon: { kind: 'master', weaponId: conditions.weaponId },
    charms: conditions.charms,
    required: conditions.required.map((skill) => ({ ...skill })),
    excludedArmorIds: excludedArmorIds(bundle, conditions.ranks),
    objective: toObjective(conditions.objective),
    activeConditionIds: [...conditions.activeConditionIds],
    maxResults: conditions.maxResults,
    timeoutMs: SOLVE_TIMEOUT_MS,
  }
}
