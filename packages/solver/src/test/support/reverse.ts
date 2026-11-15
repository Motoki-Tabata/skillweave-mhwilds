import type { MasterBundle, SkillLevel, Slot } from '@swv/data'
import type { Highs } from 'highs'
import type { SolverCharm, SolverRequest } from '../../main/request'
import type {
  ReverseLookupCandidate,
  ReverseLookupRequest,
  VirtualCharm,
} from '../../main/reverseLookup'
import { solveBuilds } from '../../main/solveBuilds'
import { fakeClock } from './harness'
import { uuid } from './builders'

/** 逆引きの要求から、同じ条件の通常の要求（護石の候補だけ差し替える）を作る */
export function toSolverRequest(
  request: ReverseLookupRequest,
  charms: SolverCharm[] = [],
): SolverRequest {
  return { ...request, charms, objective: { kind: 'feasible' } }
}

/** 仮想の護石を、通常の検索に渡せる護石にする（「任意」の枠は除く） */
export function toSolverCharm(charm: VirtualCharm): SolverCharm {
  return {
    id: uuid('virtual'),
    rarity: charm.rarity,
    skills: charm.skills.flatMap((s) => (s === null ? [] : [s])),
    slots: charm.slots,
  }
}

/** 候補の比較用の値（要るスキルを ID の順に並べる） */
export interface CharmKey {
  skills: SkillLevel[]
  slots: Slot[]
  rarity: number
}

export function keyOf(charm: VirtualCharm): CharmKey {
  const skills = toSolverCharm(charm).skills.toSorted((a, b) => a.skillId.localeCompare(b.skillId))
  return { skills, slots: charm.slots, rarity: charm.rarity }
}

/** 並べ替えの値: 要るスキルの数・レベルの合計・レア度（AC-5） */
export function orderOf(key: CharmKey): [number, number, number] {
  return [key.skills.length, key.skills.reduce((sum, s) => sum + s.level, 0), key.rarity]
}

export const compareKeys = (a: CharmKey, b: CharmKey): number => {
  const [oa, ob] = [orderOf(a), orderOf(b)]
  return oa[0] - ob[0] || oa[1] - ob[1] || oa[2] - ob[2]
}

export const sameSlots = (a: readonly Slot[], b: readonly Slot[]): boolean =>
  a.length === b.length && a.every((s, i) => s.target === b[i]?.target && s.level === b[i]?.level)

/** key が other より厳しいだけ: other の要るスキルを同じか高いレベルですべて含み、スロットの並びが同じ（AC-6） */
export function isStricterOnly(key: CharmKey, other: CharmKey): boolean {
  return (
    sameSlots(key.slots, other.slots) &&
    other.skills.every((o) => key.skills.some((s) => s.skillId === o.skillId && s.level >= o.level))
  )
}

/** 抽選テーブルの 1 パターンの枠ごとの選択肢（枠なしを除く。「任意」は null） */
function slotChoices(
  table: MasterBundle['appraisedCharm'],
  groups: (string | null)[],
  required: ReadonlySet<string>,
): (SkillLevel | null)[][] {
  return groups.flatMap((name) => {
    if (name === null) return []
    const skills = table.groups.find((g) => g.group === name)?.skills ?? []
    return [[null, ...skills.filter((s) => required.has(s.skillId))]]
  })
}

function product<T>(lists: T[][]): T[][] {
  return lists.reduce<T[][]>((acc, list) => acc.flatMap((a) => list.map((x) => [...a, x])), [[]])
}

/**
 * 総当たり（AC-2・AC-5・AC-6 の参照実装）。テーブルの全パターン・全スロットの並び・各枠「任意」か
 * 必須スキル（同じスキルは 1 つまで）の護石を 1 件ずつ通常の `solveBuilds` で解き、組めるものを残す。
 * 要るスキルとスロットの組ごとに最小のレア度を残し、AC-5 の順に並べ、先に残した候補より厳しいだけの
 * ものを除く。
 */
export async function bruteReverse(
  highs: Highs,
  master: MasterBundle,
  request: ReverseLookupRequest,
): Promise<CharmKey[]> {
  const required = new Set<string>(request.required.map((r) => r.skillId))
  const table = master.appraisedCharm
  const found = new Map<string, CharmKey>()
  for (const pattern of table.patterns) {
    const choices = product(slotChoices(table, pattern.skillGroups, required)).filter((skills) => {
      const ids = skills.flatMap((s) => (s === null ? [] : [s.skillId]))
      return new Set(ids).size === ids.length
    })
    for (const slots of pattern.slotPatterns) {
      for (const skills of choices) {
        const virtual: VirtualCharm = { rarity: pattern.rarity, skills, slots }
        const solverRequest = toSolverRequest({ ...request, maxResults: 1 }, [
          toSolverCharm(virtual),
        ])
        const response = await solveBuilds(highs, master, solverRequest, fakeClock().options)
        if (response.builds.length === 0) continue
        const key = keyOf(virtual)
        const id = JSON.stringify([key.skills, key.slots])
        const previous = found.get(id)
        if (previous === undefined || key.rarity < previous.rarity) found.set(id, key)
      }
    }
  }
  const kept: CharmKey[] = []
  for (const key of [...found.values()].toSorted(compareKeys)) {
    if (!kept.some((k) => isStricterOnly(key, k))) kept.push(key)
  }
  return kept
}

export const candidateKeys = (candidates: ReverseLookupCandidate[]): CharmKey[] =>
  candidates.map((c) => keyOf(c.charm))
