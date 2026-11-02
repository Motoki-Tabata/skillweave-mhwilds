import type { ArmorPart, ArmorRank, SkillCategory, SkillKind } from '@swv/data'
import type { SlotOwner } from '@swv/solver'

/** 防具の部位。並びは頭・胴・腕・腰・脚。 */
export const ARMOR_PARTS: readonly { id: ArmorPart; label: string }[] = [
  { id: 'head', label: '頭' },
  { id: 'chest', label: '胴' },
  { id: 'arms', label: '腕' },
  { id: 'waist', label: '腰' },
  { id: 'legs', label: '脚' },
]

/** スロットの持ち主の表示名（護石は 004 では出ない）。 */
export const SLOT_OWNER_LABELS: Record<SlotOwner, string> = {
  weapon: '武器',
  head: '頭',
  chest: '胴',
  arms: '腕',
  waist: '腰',
  legs: '脚',
  charm: '護石',
}

/** 防具のランク。低い順に並べ、末尾が「最も高いランク」。 */
export const ARMOR_RANKS: readonly { id: ArmorRank; label: string }[] = [
  { id: 'low', label: '下位' },
  { id: 'high', label: '上位' },
  { id: 'master', label: 'マスター' },
]

/** スキルの種類。並びは武器・防具・シリーズ・グループ。 */
export const SKILL_KINDS: readonly { id: SkillKind; label: string }[] = [
  { id: 'weapon', label: '武器' },
  { id: 'armor', label: '防具' },
  { id: 'series', label: 'シリーズ' },
  { id: 'group', label: 'グループ' },
]

/** スキルの分類。並びはスキルを選ぶダイアログの見出しの順（辞書には入れない）。 */
export const SKILL_CATEGORIES: readonly { id: SkillCategory; label: string }[] = [
  { id: 'attack', label: '攻撃' },
  { id: 'affinity', label: '会心' },
  { id: 'element', label: '属性・状態異常' },
  { id: 'sharpness', label: '斬れ味' },
  { id: 'weapon_specific', label: '武器種固有' },
  { id: 'defense', label: '防御・回復' },
  { id: 'resistance', label: '耐性' },
  { id: 'mobility', label: '行動・スタミナ' },
  { id: 'support', label: '探索・支援' },
]

export function skillKindLabel(kind: SkillKind): string {
  return SKILL_KINDS.find((item) => item.id === kind)?.label ?? kind
}

export function armorRankLabel(rank: ArmorRank): string {
  return ARMOR_RANKS.find((item) => item.id === rank)?.label ?? rank
}

/** 目的の選択肢（ラジオ）。 */
export const OBJECTIVE_OPTIONS = [
  {
    id: 'feasible',
    label: '条件を満たす構成',
    description: '必須スキルを満たす構成を探します。',
  },
  {
    id: 'defense',
    label: '防御力の最大化',
    description: '防具の防御力の合計が大きい順に探します。',
  },
  {
    id: 'freeSlots',
    label: '空きスロットの最大化',
    description: '空きスロットが多い順に探します。',
  },
  {
    id: 'expectedDamage',
    label: '火力の最大化',
    description: '物理の期待値が大きい順に探します。「発動条件」でオンにした効果を数えます。',
  },
] as const

export type ObjectiveChoice = (typeof OBJECTIVE_OPTIONS)[number]['id']

export function objectiveLabel(choice: ObjectiveChoice): string {
  return OBJECTIVE_OPTIONS.find((option) => option.id === choice)?.label ?? choice
}
