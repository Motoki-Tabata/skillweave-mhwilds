import type { CharmId, MasterBundle } from '@swv/data'
import type { SolverCharm } from '../../main/request'

/**
 * 系統ごとに最上位ランクの生産護石を候補にする（測定ハーネス用）。
 * apps/web の lib/charms/crafted.ts（craftedSolverCharms）の規則の写し:
 * ID（`ch:<gameId>:<rank>`）を最後の `:` で系統とランク（整数）に分け、
 * 系統ごとにランク最大の1件だけを、マスターの並び（最上位の件が現れる位置の順）で返す。
 * packages/solver は apps/web に依存できないため写している。
 */
export function topRankCraftedCharms(master: MasterBundle): SolverCharm[] {
  const split = (id: string) => {
    const at = id.lastIndexOf(':')
    return { family: id.slice(0, at), rank: Number(id.slice(at + 1)) }
  }
  const maxRank = new Map<string, number>()
  for (const c of master.charms) {
    const { family, rank } = split(c.id)
    maxRank.set(family, Math.max(maxRank.get(family) ?? rank, rank))
  }
  return master.charms
    .filter((c) => {
      const { family, rank } = split(c.id)
      return maxRank.get(family) === rank
    })
    .map((c) => ({ id: c.id as CharmId, rarity: c.rarity, skills: c.skills, slots: c.slots }))
}
