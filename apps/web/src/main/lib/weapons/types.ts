import type { SetBonusId, SlotLevel, WeaponId } from '@swv/data'

export type { NameOf } from '@/lib/charms/types'

export const WEAPON_SCHEMA_VERSION = 1

/** 武器のスロット（個体差のある武器は常に武器用）。 */
export interface WeaponSlot {
  target: 'weapon'
  level: SlotLevel
}

/** 武器の中身（保存する形。属性値はマスターと同じ単位）。 */
export interface WeaponPayload {
  baseWeaponId: WeaponId
  name: string
  attack: number
  affinity: number
  element?: { type: string; value: number }
  slots: WeaponSlot[]
  seriesBonusId: SetBonusId | null
  groupBonusId: SetBonusId | null
}

/** 端末に保存する武器（013 user-weapon-save のサーバー側と同じ形。userId・version・deletedAt は持たない）。 */
export interface StoredWeapon {
  id: string
  payload: WeaponPayload
  schemaVersion: number
  createdAt: string
  updatedAt: string
}

/** 入力中の武器。数値は入力した文字列のまま（属性値は装備画面の表示値）。 */
export interface WeaponDraft {
  baseWeaponId: WeaponId | null
  name: string
  attack: string
  affinity: string
  /** 属性の種類。null は「なし」 */
  elementType: string | null
  elementValue: string
  /** 行ごとの Lv。null は「なし」 */
  slots: (number | null)[]
  seriesBonusId: SetBonusId | null
  groupBonusId: SetBonusId | null
}
