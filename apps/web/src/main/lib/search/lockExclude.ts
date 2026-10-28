import type {
  ArmorId,
  ArmorPart,
  ArmorRank,
  DecorationId,
  MasterBundle,
  MasterDecoration,
} from '@swv/data'
import { ARMOR_PARTS, ARMOR_RANKS, armorRankLabel } from '@/constants/labels'
import { matchesQuery } from '@/lib/text'

/** 除外の候補に出す件数の上限。 */
export const EXCLUDE_CANDIDATE_LIMIT = 50

export interface ArmorOption {
  id: ArmorId
  name: string
  /** 「<部位>・<ランク>」 */
  hint: string
}

export interface DecorationOption {
  id: DecorationId
  name: string
  /** 「<武器用／防具用> Lv<n>」 */
  hint: string
}

export interface FixedCandidateGroup {
  rank: ArmorRank
  label: string
  armors: { id: ArmorId; name: string }[]
}

export interface FixedCandidates {
  /** ランクの高い順の群（マスターに無いランクの群、該当が無い群は出さない） */
  groups: FixedCandidateGroup[]
  /** 絞り込みに一致した防具の件数 */
  count: number
}

type NameOf = (id: string) => string

const PART_LABEL = new Map<ArmorPart, string>(ARMOR_PARTS.map((part) => [part.id, part.label]))

export function armorHint(part: ArmorPart, rank: ArmorRank): string {
  return `${PART_LABEL.get(part) ?? part}・${armorRankLabel(rank)}`
}

export function decorationHint(decoration: MasterDecoration): string {
  return `${decoration.target === 'weapon' ? '武器用' : '防具用'} Lv${decoration.slotLevel}`
}

/** 部位の固定の候補（防具）。ランクの選択にかかわらず全ランクを出す。 */
export function fixedCandidates(
  bundle: MasterBundle,
  nameOf: NameOf,
  part: ArmorPart,
  query: string,
): FixedCandidates {
  const groups: FixedCandidateGroup[] = []
  let count = 0
  for (const { id: rank, label } of [...ARMOR_RANKS].reverse()) {
    const armors = bundle.armors
      .filter((armor) => armor.part === part && armor.rank === rank)
      .map((armor) => ({ id: armor.id, name: nameOf(armor.id) }))
      .filter((armor) => matchesQuery(armor.name, query))
    if (armors.length === 0) continue
    count += armors.length
    groups.push({ rank, label, armors })
  }
  return { groups, count }
}

export interface ExcludeCandidates {
  armors: ArmorOption[]
  decorations: DecorationOption[]
  /** 一致した件数（打ち切る前） */
  total: number
  /** 打ち切って出さなかった件数 */
  remaining: number
}

/**
 * 除外の候補。入力が空のときは出さない。防具は部位→ランクの高い順→マスターの順、
 * 装飾品はマスターの順。除外済みは出さず、先頭から 50 件まで。
 */
export function excludeCandidates(
  bundle: MasterBundle,
  nameOf: NameOf,
  query: string,
  excludedArmorIds: readonly ArmorId[],
  excludedDecorationIds: readonly DecorationId[],
): ExcludeCandidates {
  if (query.trim() === '') return { armors: [], decorations: [], total: 0, remaining: 0 }
  const partOrder = ARMOR_PARTS.map((part) => part.id)
  const rankOrder = ARMOR_RANKS.map((rank) => rank.id)
  const armors = bundle.armors
    .map((armor, index) => ({ armor, index }))
    .filter(
      ({ armor }) => !excludedArmorIds.includes(armor.id) && matchesQuery(nameOf(armor.id), query),
    )
    .sort(
      (a, b) =>
        partOrder.indexOf(a.armor.part) - partOrder.indexOf(b.armor.part) ||
        rankOrder.indexOf(b.armor.rank) - rankOrder.indexOf(a.armor.rank) ||
        a.index - b.index,
    )
    .map(({ armor }) => ({
      id: armor.id,
      name: nameOf(armor.id),
      hint: armorHint(armor.part, armor.rank),
    }))
  const decorations = bundle.decorations
    .filter(
      (decoration) =>
        !excludedDecorationIds.includes(decoration.id) &&
        matchesQuery(nameOf(decoration.id), query),
    )
    .map((decoration) => ({
      id: decoration.id,
      name: nameOf(decoration.id),
      hint: decorationHint(decoration),
    }))
  const total = armors.length + decorations.length
  const shownArmors = armors.slice(0, EXCLUDE_CANDIDATE_LIMIT)
  const shownDecorations = decorations.slice(0, EXCLUDE_CANDIDATE_LIMIT - shownArmors.length)
  return {
    armors: shownArmors,
    decorations: shownDecorations,
    total,
    remaining: total - shownArmors.length - shownDecorations.length,
  }
}
