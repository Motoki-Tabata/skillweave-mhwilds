import type { SolverCharm, Uuid } from '@swv/solver'
import type { StoredCharm } from '@/lib/charms/storage'
import { charmEligibility } from '@/lib/charms/validate'
import type { ValidateContext } from '@/lib/charms/validate'

/** 保存済みの護石のうち、構造上の制約を満たすものを検索の候補（SolverCharm）にする。 */
export function eligibleSolverCharms(
  charms: readonly StoredCharm[],
  ctx: ValidateContext,
): SolverCharm[] {
  return charms
    .filter((charm) => charmEligibility(charm.payload, ctx).eligible)
    .map((charm) => ({
      id: charm.id as Uuid,
      rarity: charm.payload.rarity,
      skills: charm.payload.skills.map((skill) => ({ ...skill })),
      slots: charm.payload.slots.map((slot) => ({ ...slot })),
    }))
}
