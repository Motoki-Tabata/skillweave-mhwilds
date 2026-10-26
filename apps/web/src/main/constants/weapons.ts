/** 個体差のある武器の基にするアーティア武器を、辞書の名前で見分ける接頭辞（plan D1）。 */
export const ARTIA_NAME_PREFIX = 'アーティア'

export const WEAPON_NAME_MAX = 30
export const WEAPON_ATTACK_MIN = 1
export const WEAPON_ATTACK_MAX = 999
export const WEAPON_AFFINITY_MIN = -100
export const WEAPON_AFFINITY_MAX = 100
/** 属性値は装備画面の表示値で入力し、保存はこの倍率で割った値（マスターと同じ単位）。 */
export const ELEMENT_DISPLAY_FACTOR = 10
export const WEAPON_ELEMENT_DISPLAY_MIN = 10
export const WEAPON_ELEMENT_DISPLAY_MAX = 990
export const WEAPON_MAX_SLOTS = 3
/** 武器のスロットの Lv の範囲。 */
export const WEAPON_SLOT_LEVELS: readonly (1 | 2 | 3)[] = [1, 2, 3]

export interface ElementTypeLabel {
  /** MHDB の属性の種類（`MasterWeapon.element.type`） */
  id: string
  name: string
}

/** 属性の種類の表示名と並び。 */
export const ELEMENT_TYPES: readonly ElementTypeLabel[] = [
  { id: 'fire', name: '火属性' },
  { id: 'water', name: '水属性' },
  { id: 'thunder', name: '雷属性' },
  { id: 'ice', name: '氷属性' },
  { id: 'dragon', name: '龍属性' },
  { id: 'poison', name: '毒属性' },
  { id: 'paralysis', name: '麻痺属性' },
  { id: 'sleep', name: '睡眠属性' },
  { id: 'blastblight', name: '爆破属性' },
]

/** 属性の種類の表示名。定数に無い値は種類の文字列をそのまま返す。 */
export function elementTypeName(id: string): string {
  return ELEMENT_TYPES.find((type) => type.id === id)?.name ?? id
}
