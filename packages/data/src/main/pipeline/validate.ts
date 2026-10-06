import type { MasterBundle, MasterDictionary, Slot, SkillLevel } from '../index.ts'
import type { SetBonusMismatch } from './convert.ts'

export interface Violation {
  rule: string
  message: string
}

/** 検証の入力。辞書は ja・en の両方 */
export interface ValidateInput {
  bundle: MasterBundle
  dictionaries: { ja: MasterDictionary; en: MasterDictionary }
  /** 変換が持つ、防具セットの間で不一致の発動部位数（出力済みの dist を検証するときは空） */
  mismatches?: SetBonusMismatch[]
}

const ARMOR_RANKS: ReadonlySet<string> = new Set(['low', 'high', 'master'])
const MIN_SLOT_LEVEL = 1
const MAX_SLOT_LEVEL = 4

function checkDuplicates(bundle: MasterBundle, out: Violation[]): void {
  const sets: [string, { id: string }[]][] = [
    ['skills', bundle.skills],
    ['setBonuses', bundle.setBonuses],
    ['armors', bundle.armors],
    ['decorations', bundle.decorations],
    ['weapons', bundle.weapons],
    ['charms', bundle.charms],
  ]
  const seen = new Set<string>()
  for (const [name, entries] of sets) {
    for (const { id } of entries) {
      if (seen.has(id))
        out.push({ rule: 'duplicate-id', message: `ID が重複しています: ${id}（${name}）` })
      seen.add(id)
    }
  }
}

function checkSkillLevels(
  owner: string,
  skills: SkillLevel[],
  maxLevels: Map<string, number>,
  out: Violation[],
): void {
  for (const { skillId, level } of skills) {
    const max = maxLevels.get(skillId)
    if (max === undefined) {
      out.push({
        rule: 'missing-skill',
        message: `${owner}: 存在しないスキル ${skillId} を参照しています`,
      })
    } else if (!Number.isInteger(level) || level < 1 || level > max) {
      out.push({
        rule: 'skill-level',
        message: `${owner}: ${skillId} のレベル ${level} が 1 以上 ${max} 以下ではありません`,
      })
    }
  }
}

function checkSlots(owner: string, slots: Slot[], out: Violation[]): void {
  for (const slot of slots) {
    if (
      !Number.isInteger(slot.level) ||
      slot.level < MIN_SLOT_LEVEL ||
      slot.level > MAX_SLOT_LEVEL
    ) {
      out.push({
        rule: 'slot-level',
        message: `${owner}: スロット Lv ${slot.level} が 1〜4 ではありません`,
      })
    }
  }
}

function checkSetBonuses(
  bundle: MasterBundle,
  maxLevels: Map<string, number>,
  out: Violation[],
): void {
  for (const setBonus of bundle.setBonuses) {
    const max = maxLevels.get(setBonus.skillId)
    if (max === undefined) {
      out.push({
        rule: 'missing-skill',
        message: `${setBonus.id}: 存在しないスキル ${setBonus.skillId} を参照しています`,
      })
    }
    setBonus.thresholds.forEach((threshold, index) => {
      const previous = setBonus.thresholds[index - 1]
      if (!Number.isInteger(threshold.pieces)) {
        out.push({
          rule: 'threshold-pieces',
          message: `${setBonus.id}: 発動部位数 ${threshold.pieces} が整数ではありません`,
        })
      }
      if (previous && threshold.pieces <= previous.pieces) {
        out.push({
          rule: 'threshold-order',
          message: `${setBonus.id}: 発動部位数が昇順になっていないか重複しています（${setBonus.thresholds.map((t) => t.pieces).join(', ')}）`,
        })
      }
      if (
        max !== undefined &&
        (!Number.isInteger(threshold.level) || threshold.level < 1 || threshold.level > max)
      ) {
        out.push({
          rule: 'skill-level',
          message: `${setBonus.id}: レベル ${threshold.level} が 1 以上 ${max} 以下ではありません`,
        })
      }
    })
  }
}

function checkMismatches(mismatches: SetBonusMismatch[], out: Violation[]): void {
  for (const mismatch of mismatches) {
    const detail = mismatch.byArmorSet
      .map((entry) => {
        const values = entry.thresholds.map((t) => `${t.pieces}部位→Lv${t.level}`).join(', ')
        return `防具セット ${entry.armorSetGameId}: ${values}`
      })
      .join(' / ')
    out.push({
      rule: 'set-bonus-mismatch',
      message: `${mismatch.id}: 防具セットの間で発動部位数とレベルが一致しません（${detail}）`,
    })
  }
}

function checkDictionaries(input: ValidateInput, ids: string[], out: Violation[]): void {
  for (const locale of ['ja', 'en'] as const) {
    const dictionary = input.dictionaries[locale]
    for (const id of ids) {
      const name = dictionary.entries[id]?.name
      if (typeof name !== 'string' || name === '') {
        out.push({ rule: 'dictionary-name', message: `${id}: 辞書（${locale}）に名前がありません` })
      }
    }
  }
}

/** 出力の `MasterBundle` と辞書を検証する。違反は全件を返す（0件なら空配列） */
export function validate(input: ValidateInput): Violation[] {
  const { bundle } = input
  const out: Violation[] = []
  checkDuplicates(bundle, out)

  const maxLevels = new Map(bundle.skills.map((skill) => [skill.id as string, skill.maxLevel]))
  const setBonusIds = new Set<string>(bundle.setBonuses.map((setBonus) => setBonus.id))
  const checkBonusRefs = (owner: string, ids: string[]): void => {
    for (const id of ids) {
      if (!setBonusIds.has(id)) {
        out.push({
          rule: 'missing-set-bonus',
          message: `${owner}: 存在しない ${id} を参照しています`,
        })
      }
    }
  }

  for (const skill of bundle.skills) {
    if (!Number.isInteger(skill.maxLevel) || skill.maxLevel < 1) {
      out.push({
        rule: 'skill-level',
        message: `${skill.id}: 最大レベル ${skill.maxLevel} が 1 以上ではありません`,
      })
    }
  }
  for (const armor of bundle.armors) {
    checkSkillLevels(armor.id, armor.skills, maxLevels, out)
    checkBonusRefs(armor.id, armor.setBonusIds)
    checkSlots(armor.id, armor.slots, out)
    if (!ARMOR_RANKS.has(armor.rank)) {
      out.push({
        rule: 'armor-rank',
        message: `${armor.id}: rank ${String(armor.rank)} が low・high・master のどれでもありません`,
      })
    }
  }
  for (const decoration of bundle.decorations) {
    checkSkillLevels(decoration.id, decoration.skills, maxLevels, out)
    checkSlots(decoration.id, [{ target: decoration.target, level: decoration.slotLevel }], out)
  }
  for (const weapon of bundle.weapons) {
    checkSkillLevels(weapon.id, weapon.skills, maxLevels, out)
    checkBonusRefs(weapon.id, weapon.setBonusIds)
    checkSlots(weapon.id, weapon.slots, out)
  }
  for (const charm of bundle.charms) {
    checkSkillLevels(charm.id, charm.skills, maxLevels, out)
    checkSlots(charm.id, charm.slots, out)
  }
  bundle.appraisedCharm.groups.forEach((group, index) => {
    checkSkillLevels(`appraisedCharm.groups[${index}]`, group.skills, maxLevels, out)
  })
  bundle.appraisedCharm.patterns.forEach((pattern, index) => {
    pattern.slotPatterns.forEach((slots) =>
      checkSlots(`appraisedCharm.patterns[${index}]`, slots, out),
    )
  })
  checkSetBonuses(bundle, maxLevels, out)
  checkMismatches(input.mismatches ?? [], out)

  const ids = [
    ...bundle.skills,
    ...bundle.setBonuses,
    ...bundle.armors,
    ...bundle.decorations,
    ...bundle.weapons,
    ...bundle.charms,
  ].map((entry) => entry.id as string)
  checkDictionaries(input, ids, out)
  return out
}

export function formatViolation(violation: Violation): string {
  return `[${violation.rule}] ${violation.message}`
}
