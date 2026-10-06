/** 武器種（MHDB の `kind`）の表示名。マスターの項目ではなく画面の文言として持つ（decisions.md Q25）。 */
export interface WeaponTypeLabel {
  /** MHDB の kind（`MasterWeapon.weaponType`） */
  id: string
  /** 正式名 */
  name: string
  /** 武器種のボタン用の短い表示名（D1） */
  shortName: string
}

/** ゲーム内の並び順。 */
export const WEAPON_TYPES: readonly WeaponTypeLabel[] = [
  { id: 'great-sword', name: '大剣', shortName: '大剣' },
  { id: 'long-sword', name: '太刀', shortName: '太刀' },
  { id: 'sword-shield', name: '片手剣', shortName: '片手剣' },
  { id: 'dual-blades', name: '双剣', shortName: '双剣' },
  { id: 'hammer', name: 'ハンマー', shortName: 'ハンマー' },
  { id: 'hunting-horn', name: '狩猟笛', shortName: '狩猟笛' },
  { id: 'lance', name: 'ランス', shortName: 'ランス' },
  { id: 'gunlance', name: 'ガンランス', shortName: 'ガンス' },
  { id: 'switch-axe', name: 'スラッシュアックス', shortName: 'スラアク' },
  { id: 'charge-blade', name: 'チャージアックス', shortName: 'チャアク' },
  { id: 'insect-glaive', name: '操虫棍', shortName: '操虫棍' },
  { id: 'light-bowgun', name: 'ライトボウガン', shortName: 'ライト' },
  { id: 'heavy-bowgun', name: 'ヘビィボウガン', shortName: 'ヘビィ' },
  { id: 'bow', name: '弓', shortName: '弓' },
]

const WEAPON_TYPE_BY_ID = new Map(WEAPON_TYPES.map((type) => [type.id, type]))

/** 武器種の正式名。定数に無い値は kind の文字列をそのまま返す（画面を壊さないため）。 */
export function weaponTypeName(id: string): string {
  return WEAPON_TYPE_BY_ID.get(id)?.name ?? id
}

/** 武器種の並び順。定数に無い値は末尾。 */
export function weaponTypeOrder(id: string): number {
  const index = WEAPON_TYPES.findIndex((type) => type.id === id)
  return index === -1 ? WEAPON_TYPES.length : index
}
