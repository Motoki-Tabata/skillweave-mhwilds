import type { MasterBundle, MasterSkill, SkillLevel, Slot } from '@swv/data'
import {
  CHARM_MAX_SKILLS,
  CHARM_MAX_SLOTS,
  CHARM_RARITIES,
  CHARM_SLOT_LEVELS,
} from '@/constants/charms'
import type { CharmDraft, CharmPayload, NameOf } from '@/lib/charms/types'

export type CharmErrorCode =
  | 'rarity'
  | 'duplicate'
  | 'gap'
  | 'unknown-skill'
  | 'skill-kind'
  | 'over-level'
  | 'level-range'
  | 'too-many'
  | 'slot-target'
  | 'slot-level'

/** 項目ごとのエラー。`index` は 0 始まりの行（レア度は 0）。 */
export interface CharmError {
  field: 'rarity' | 'skills' | 'slots'
  index: number
  code: CharmErrorCode
  message: string
  /** 検索の候補から外す理由の文言（screen-design.md 3.3）。該当しないコードは message と同じ */
  reason: string
}

export interface ValidateContext {
  bundle: MasterBundle
  nameOf: NameOf
}

function error(
  field: CharmError['field'],
  index: number,
  code: CharmErrorCode,
  message: string,
  reason = message,
): CharmError {
  return { field, index, code, message, reason }
}

function rarityError(rarity: number | null): CharmError | null {
  if (rarity === null) return error('rarity', 0, 'rarity', 'レア度を選んでください。')
  if (!CHARM_RARITIES.includes(rarity)) {
    return error('rarity', 0, 'rarity', 'レア度は 5〜8 から選んでください。')
  }
  return null
}

function skillLevelError(
  skill: SkillLevel,
  master: MasterSkill,
  index: number,
  ctx: ValidateContext,
): CharmError | null {
  const name = ctx.nameOf(skill.skillId)
  if (master.kind !== 'weapon' && master.kind !== 'armor') {
    return error(
      'skills',
      index,
      'skill-kind',
      '武器スキルか防具スキルを選んでください。シリーズスキルとグループスキルは護石に付きません。',
    )
  }
  if (skill.level > master.maxLevel) {
    return error(
      'skills',
      index,
      'over-level',
      `Lv${skill.level} は最大レベル（Lv${master.maxLevel}）を超えています。レベルを選び直してください。`,
      `「${name} Lv${skill.level}」が最大レベル（Lv${master.maxLevel}）を超えています。`,
    )
  }
  if (!Number.isInteger(skill.level) || skill.level < 1) {
    return error('skills', index, 'level-range', 'レベルを選び直してください。')
  }
  return null
}

function skillRowError(
  skills: readonly (SkillLevel | null)[],
  index: number,
  ctx: ValidateContext,
): CharmError | null {
  const skill = skills[index]
  if (skill === null) {
    if (skills.slice(index + 1).some((later) => later !== null)) {
      return error(
        'skills',
        index,
        'gap',
        `スキル${index + 1}が空です。スキルは上の行から順に入力してください。`,
      )
    }
    return null
  }
  const master = ctx.bundle.skills.find((item) => item.id === skill.skillId)
  if (master === undefined) {
    return error(
      'skills',
      index,
      'unknown-skill',
      'このスキルは現行のマスターにありません。別のスキルを選ぶか空にしてください。',
      `スキル「${ctx.nameOf(skill.skillId)}」が現行のマスターにありません。`,
    )
  }
  const first = skills.findIndex((other) => other?.skillId === skill.skillId)
  if (first !== index) {
    return error(
      'skills',
      index,
      'duplicate',
      `スキル${first + 1}と同じスキルです。別のスキルを選ぶか空にしてください。`,
    )
  }
  return skillLevelError(skill, master, index, ctx)
}

function slotRowError(slots: readonly (Slot | null)[], index: number): CharmError | null {
  const slot = slots[index]
  if (slot === null) {
    if (slots.slice(index + 1).some((later) => later !== null)) {
      return error(
        'slots',
        index,
        'gap',
        `スロット${index + 1}が「なし」です。スロットは上の行から順に入力してください。`,
      )
    }
    return null
  }
  if (slot.target !== 'weapon' && slot.target !== 'armor') {
    return error('slots', index, 'slot-target', 'スロットの種別は武器用か防具用で選んでください。')
  }
  if (!(CHARM_SLOT_LEVELS as readonly number[]).includes(slot.level)) {
    return error('slots', index, 'slot-level', 'スロットの Lv は 1〜3 で選んでください。')
  }
  return null
}

/**
 * 構造上の制約の検証。エラーは項目の順（レア度・スキル・スロット）に返し、1つの行に1件まで。
 * 画面の「候補からスキルを選んでください。」（Combobox の入力の状態）はここでは扱わない。
 */
export function validateCharm(draft: CharmDraft, ctx: ValidateContext): CharmError[] {
  const errors: CharmError[] = []
  const rarity = rarityError(draft.rarity)
  if (rarity !== null) errors.push(rarity)
  for (let i = 0; i < draft.skills.length; i += 1) {
    const found =
      i >= CHARM_MAX_SKILLS
        ? error('skills', i, 'too-many', `スキルは ${CHARM_MAX_SKILLS} 個までです。`)
        : skillRowError(draft.skills, i, ctx)
    if (found !== null) errors.push(found)
  }
  for (let i = 0; i < draft.slots.length; i += 1) {
    const found =
      i >= CHARM_MAX_SLOTS
        ? error('slots', i, 'too-many', `スロットは ${CHARM_MAX_SLOTS} 枠までです。`)
        : slotRowError(draft.slots, i)
    if (found !== null) errors.push(found)
  }
  return errors
}

export type CharmEligibility = { eligible: true } | { eligible: false; reasons: string[] }

/** 保存済みの護石が検索の候補になるか。外す理由は一覧の「検索対象外の理由」の文言。 */
export function charmEligibility(payload: CharmPayload, ctx: ValidateContext): CharmEligibility {
  const errors = validateCharm(payload, ctx)
  if (errors.length === 0) return { eligible: true }
  return { eligible: false, reasons: errors.map((item) => item.reason) }
}
