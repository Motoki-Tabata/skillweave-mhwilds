import type { MasterCharm } from '@swv/data'
import type { SolverCharm } from '@swv/solver'

/** 生産護石（マスターの護石）か。ID が `ch:` で始まるものを生産護石とし、鑑定護石（UUID）と区別する。 */
export function isCraftedCharmId(id: string): boolean {
  return id.startsWith('ch:')
}

function splitId(id: string): { family: string; rank: number } {
  const at = id.lastIndexOf(':')
  return { family: id.slice(0, at), rank: Number(id.slice(at + 1)) }
}

/**
 * マスターの生産護石を、系統（`ch:<gameId>`）ごとに最上位ランクの1件だけ `SolverCharm` にする。
 * 並びは、各系統の最上位の件がマスターに現れる位置の順。
 *
 * 前提: 上位ランクは下位ランクのスキル・スロットを包含する。包含は検査しない
 * （マスターの更新で崩れたら `crafted.spec.ts` が落ちる）。
 */
export function craftedSolverCharms(charms: readonly MasterCharm[]): SolverCharm[] {
  const top = new Map<string, { rank: number; charm: MasterCharm }>()
  for (const charm of charms) {
    const { family, rank } = splitId(charm.id)
    const current = top.get(family)
    if (current === undefined || rank > current.rank) top.set(family, { rank, charm })
  }
  return charms
    .filter((charm) => top.get(splitId(charm.id).family)?.charm === charm)
    .map((charm) => ({
      id: charm.id,
      rarity: charm.rarity,
      skills: charm.skills.map((skill) => ({ ...skill })),
      slots: charm.slots.map((slot) => ({ ...slot })),
    }))
}
