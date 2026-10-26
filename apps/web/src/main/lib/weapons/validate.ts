import type { MasterBundle, MasterWeapon, SetBonusId, SkillKind } from '@swv/data'
import {
  ARTIA_NAME_PREFIX,
  ELEMENT_DISPLAY_FACTOR,
  ELEMENT_TYPES,
  WEAPON_AFFINITY_MAX,
  WEAPON_AFFINITY_MIN,
  WEAPON_ATTACK_MAX,
  WEAPON_ATTACK_MIN,
  WEAPON_ELEMENT_DISPLAY_MAX,
  WEAPON_ELEMENT_DISPLAY_MIN,
  WEAPON_MAX_SLOTS,
  WEAPON_NAME_MAX,
  WEAPON_SLOT_LEVELS,
} from '@/constants/weapons'
import { readInteger, payloadToDraft } from '@/lib/weapons/input'
import type { NameOf, WeaponDraft, WeaponPayload } from '@/lib/weapons/types'

export type WeaponErrorCode =
  | 'base-missing'
  | 'base-unknown'
  | 'name'
  | 'attack-empty'
  | 'attack-range'
  | 'affinity-empty'
  | 'affinity-range'
  | 'element-type'
  | 'element-empty'
  | 'element-range'
  | 'slot-gap'
  | 'slot-level'
  | 'slot-target'
  | 'too-many'
  | 'series-unknown'
  | 'group-unknown'

export type WeaponErrorField =
  'baseWeapon' | 'name' | 'attack' | 'affinity' | 'element' | 'slots' | 'seriesBonus' | 'groupBonus'

/** 項目ごとのエラー。`index` はスロットの 0 始まりの行（それ以外は 0）。 */
export interface WeaponError {
  field: WeaponErrorField
  index: number
  code: WeaponErrorCode
  message: string
}

export interface ValidateContext {
  bundle: MasterBundle
  nameOf: NameOf
}

/** マスターの武器のうち、辞書の名前がアーティアで始まるもの（plan D1）。 */
export function isArtiaWeapon(weapon: MasterWeapon, nameOf: NameOf): boolean {
  return nameOf(weapon.id).startsWith(ARTIA_NAME_PREFIX)
}

function error(
  field: WeaponErrorField,
  code: WeaponErrorCode,
  message: string,
  index = 0,
): WeaponError {
  return { field, index, code, message }
}

function nameError(name: string): WeaponError | null {
  return [...name.trim()].length > WEAPON_NAME_MAX
    ? error('name', 'name', `名前は ${WEAPON_NAME_MAX} 文字以内で入力してください。`)
    : null
}

function attackError(text: string): WeaponError | null {
  if (text.trim() === '') return error('attack', 'attack-empty', '攻撃力を入力してください。')
  const value = readInteger(text)
  if (value === null || value < WEAPON_ATTACK_MIN || value > WEAPON_ATTACK_MAX) {
    return error(
      'attack',
      'attack-range',
      `攻撃力は ${WEAPON_ATTACK_MIN}〜${WEAPON_ATTACK_MAX} の整数で入力してください。`,
    )
  }
  return null
}

function affinityError(text: string): WeaponError | null {
  if (text.trim() === '') return error('affinity', 'affinity-empty', '会心率を入力してください。')
  const value = readInteger(text)
  if (value === null || value < WEAPON_AFFINITY_MIN || value > WEAPON_AFFINITY_MAX) {
    return error(
      'affinity',
      'affinity-range',
      `会心率は ${WEAPON_AFFINITY_MIN}〜${WEAPON_AFFINITY_MAX} の整数で入力してください。`,
    )
  }
  return null
}

function elementError(type: string | null, valueText: string): WeaponError | null {
  if (type === null) return null
  if (!ELEMENT_TYPES.some((item) => item.id === type)) {
    return error('element', 'element-type', '属性の種類を選び直してください。')
  }
  if (valueText.trim() === '') {
    return error('element', 'element-empty', '属性値を入力してください。')
  }
  const value = readInteger(valueText)
  if (
    value === null ||
    value < WEAPON_ELEMENT_DISPLAY_MIN ||
    value > WEAPON_ELEMENT_DISPLAY_MAX ||
    value % ELEMENT_DISPLAY_FACTOR !== 0
  ) {
    return error(
      'element',
      'element-range',
      `属性値は ${WEAPON_ELEMENT_DISPLAY_MIN}〜${WEAPON_ELEMENT_DISPLAY_MAX} の ${ELEMENT_DISPLAY_FACTOR} の倍数で入力してください。`,
    )
  }
  return null
}

function slotErrors(slots: readonly (number | null)[]): WeaponError[] {
  const errors: WeaponError[] = []
  slots.forEach((level, index) => {
    if (index >= WEAPON_MAX_SLOTS) {
      errors.push(error('slots', 'too-many', `スロットは ${WEAPON_MAX_SLOTS} 枠までです。`, index))
    } else if (level === null) {
      if (slots.slice(index + 1).some((later) => later !== null)) {
        errors.push(
          error(
            'slots',
            'slot-gap',
            `スロット${index + 1}が「なし」です。スロットは上の行から順に入力してください。`,
            index,
          ),
        )
      }
    } else if (!(WEAPON_SLOT_LEVELS as readonly number[]).includes(level)) {
      errors.push(error('slots', 'slot-level', 'スロットの Lv は 1〜3 で選んでください。', index))
    }
  })
  return errors
}

/** マスターに依らない部分（範囲・形・個数）の検証。下書きの項目ごとに返す。 */
function draftStructureErrors(draft: WeaponDraft): WeaponError[] {
  return [
    nameError(draft.name),
    attackError(draft.attack),
    affinityError(draft.affinity),
    elementError(draft.elementType, draft.elementValue),
  ].flatMap((found) => (found === null ? [] : [found]))
}

/**
 * 保存した形の、マスターに依らない検証（保存層が読み込みの後に使う）。
 * 現行のマスターに無い ID は構造のエラーではない。
 */
export function validatePayload(payload: WeaponPayload): WeaponError[] {
  const draft = payloadToDraft(payload)
  const errors = draftStructureErrors(draft)
  errors.push(...slotErrors(draft.slots))
  payload.slots.forEach((slot, index) => {
    if (slot.target !== 'weapon') {
      errors.push(error('slots', 'slot-target', '武器のスロットは武器用です。', index))
    }
  })
  return errors
}

function bonusKindOk(bundle: MasterBundle, id: SetBonusId | null, kind: SkillKind): boolean {
  const bonus = bundle.setBonuses.find((item) => item.id === id)
  if (bonus === undefined) return false
  return bundle.skills.find((skill) => skill.id === bonus.skillId)?.kind === kind
}

function baseWeaponOk(payloadBase: string, ctx: ValidateContext): boolean {
  const weapon = ctx.bundle.weapons.find((item) => item.id === payloadBase)
  return weapon !== undefined && isArtiaWeapon(weapon, ctx.nameOf)
}

/** 構造上の制約の検証。エラーは項目の順に返す。Combobox の入力の状態（候補を選んでいない）は画面で扱う。 */
export function validateWeapon(draft: WeaponDraft, ctx: ValidateContext): WeaponError[] {
  const errors: WeaponError[] = []
  if (draft.baseWeaponId === null) {
    errors.push(error('baseWeapon', 'base-missing', '基の武器を選んでください。'))
  } else if (!baseWeaponOk(draft.baseWeaponId, ctx)) {
    errors.push(
      error(
        'baseWeapon',
        'base-unknown',
        'この基の武器は現行のマスターにありません。選び直してください。',
      ),
    )
  }
  errors.push(...draftStructureErrors(draft), ...slotErrors(draft.slots))
  if (draft.seriesBonusId !== null && !bonusKindOk(ctx.bundle, draft.seriesBonusId, 'series')) {
    errors.push(
      error(
        'seriesBonus',
        'series-unknown',
        'このシリーズスキルは現行のマスターにありません。別のスキルを選ぶか空にしてください。',
      ),
    )
  }
  if (draft.groupBonusId !== null && !bonusKindOk(ctx.bundle, draft.groupBonusId, 'group')) {
    errors.push(
      error(
        'groupBonus',
        'group-unknown',
        'このグループスキルは現行のマスターにありません。別のスキルを選ぶか空にしてください。',
      ),
    )
  }
  return errors
}

export type WeaponEligibility = { eligible: true } | { eligible: false; reasons: string[] }

/**
 * 保存済みの武器が検索の候補になるか。基の武器・付与スキルが現行のマスターに（付与スキルは
 * その種別で）無ければ外す。理由は一覧の「検索対象外の理由」の文言。
 */
export function weaponEligibility(payload: WeaponPayload, ctx: ValidateContext): WeaponEligibility {
  const reasons: string[] = []
  if (!baseWeaponOk(payload.baseWeaponId, ctx)) {
    reasons.push('基の武器が現行のマスターにありません。')
  }
  if (payload.seriesBonusId !== null && !bonusKindOk(ctx.bundle, payload.seriesBonusId, 'series')) {
    reasons.push('シリーズスキルが現行のマスターにありません。')
  }
  if (payload.groupBonusId !== null && !bonusKindOk(ctx.bundle, payload.groupBonusId, 'group')) {
    reasons.push('グループスキルが現行のマスターにありません。')
  }
  return reasons.length === 0 ? { eligible: true } : { eligible: false, reasons }
}
