import { ELEMENT_DISPLAY_FACTOR } from '@/constants/weapons'
import { normalizeForSearch } from '@/lib/text'
import type { WeaponDraft, WeaponPayload } from '@/lib/weapons/types'

/**
 * 数値の入力を整数として読む。全角の数字と「－」は半角に直し、前後の空白を除く。
 * 整数の形でなければ null。
 */
export function readInteger(text: string): number | null {
  const normalized = normalizeForSearch(text)
    .replaceAll(/[－−ー]/g, '-')
    .trim()
  return /^-?\d+$/.test(normalized) ? Number(normalized) : null
}

/** 検証を通った下書きを、保存する形にする。属性値は表示値 ÷ 10。 */
export function draftToPayload(draft: WeaponDraft): WeaponPayload {
  const elementValue = readInteger(draft.elementValue)
  return {
    baseWeaponId: draft.baseWeaponId!,
    name: draft.name.trim(),
    attack: readInteger(draft.attack)!,
    affinity: readInteger(draft.affinity)!,
    ...(draft.elementType !== null && elementValue !== null
      ? { element: { type: draft.elementType, value: elementValue / ELEMENT_DISPLAY_FACTOR } }
      : {}),
    slots: draft.slots.flatMap((level) =>
      level === null ? [] : [{ target: 'weapon' as const, level: level as 1 | 2 | 3 }],
    ),
    seriesBonusId: draft.seriesBonusId,
    groupBonusId: draft.groupBonusId,
  }
}

/** 保存した武器をフォームに読み込む形にする。属性値は表示値（× 10）。 */
export function payloadToDraft(payload: WeaponPayload): WeaponDraft {
  return {
    baseWeaponId: payload.baseWeaponId,
    name: payload.name,
    attack: String(payload.attack),
    affinity: String(payload.affinity),
    elementType: payload.element?.type ?? null,
    elementValue:
      payload.element === undefined ? '' : String(payload.element.value * ELEMENT_DISPLAY_FACTOR),
    slots: payload.slots.map((slot) => slot.level),
    seriesBonusId: payload.seriesBonusId,
    groupBonusId: payload.groupBonusId,
  }
}
