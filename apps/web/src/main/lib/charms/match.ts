import type { AppraisedCharmPattern, MasterBundle, SkillLevel, Slot } from '@swv/data'
import { slotsLabel } from '@/lib/charms/format'
import type { CharmPayload, NameOf } from '@/lib/charms/types'

/** 照合の結果。合わない点は画面にそのまま出す文言の配列。 */
export type CharmMatch =
  { status: 'pass' } | { status: 'unchecked' } | { status: 'mismatch'; issues: string[] }

type Groups = MasterBundle['appraisedCharm']['groups']

function sameSlots(a: readonly Slot[], b: readonly Slot[]): boolean {
  return (
    a.length === b.length &&
    a.every((slot, i) => slot.target === b[i].target && slot.level === b[i].level)
  )
}

function groupHas(
  groups: Groups,
  groupName: string | null | undefined,
  skill: SkillLevel,
): boolean {
  if (groupName === null || groupName === undefined) return false
  return (
    groups
      .find((group) => group.group === groupName)
      ?.skills.some((s) => s.skillId === skill.skillId && s.level === skill.level) ?? false
  )
}

function skillFits(pattern: AppraisedCharmPattern, groups: Groups, charm: CharmPayload): boolean {
  return charm.skills.every((skill, i) => groupHas(groups, pattern.skillGroups[i], skill))
}

function slotsFit(pattern: AppraisedCharmPattern, charm: CharmPayload): boolean {
  return pattern.slotPatterns.some((slots) => sameSlots(slots, charm.slots))
}

function skillIssue(
  patterns: AppraisedCharmPattern[],
  groups: Groups,
  charm: CharmPayload,
  index: number,
  nameOf: NameOf,
): string | null {
  const skill = charm.skills[index]
  const label = `スキル${index + 1}`
  if (!patterns.some((p) => (p.skillGroups[index] ?? null) !== null)) {
    return `${label}の枠は、レア${charm.rarity}にはありません。`
  }
  if (patterns.some((p) => groupHas(groups, p.skillGroups[index], skill))) return null
  return `${label}「${nameOf(skill.skillId)} Lv${skill.level}」は、レア${charm.rarity}の${label}の枠に出ません。`
}

/**
 * 抽選テーブルとの照合（decisions.md Q33）。護石が持つスキルとスロットだけを、並び順どおりに照らす。
 * そのレア度のパターンが無ければ「未検査」。どれかのパターンに合えば「合格」。
 */
export function matchCharm(charm: CharmPayload, bundle: MasterBundle, nameOf: NameOf): CharmMatch {
  const patterns = bundle.appraisedCharm.patterns.filter((p) => p.rarity === charm.rarity)
  if (patterns.length === 0) return { status: 'unchecked' }
  const groups = bundle.appraisedCharm.groups
  if (patterns.some((p) => skillFits(p, groups, charm) && slotsFit(p, charm))) {
    return { status: 'pass' }
  }
  const issues: string[] = []
  for (let i = 0; i < charm.skills.length; i += 1) {
    const issue = skillIssue(patterns, groups, charm, i, nameOf)
    if (issue !== null) issues.push(issue)
  }
  if (!patterns.some((p) => slotsFit(p, charm))) {
    issues.push(`スロットの並び「${slotsLabel(charm.slots)}」は、レア${charm.rarity}にありません。`)
  }
  if (issues.length === 0) {
    issues.push(
      `スキルとスロットの組み合わせが、レア${charm.rarity}のどのパターンにも当てはまりません。`,
    )
  }
  return { status: 'mismatch', issues }
}
