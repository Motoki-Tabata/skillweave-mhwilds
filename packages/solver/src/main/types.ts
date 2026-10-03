/**
 * packages/solver の入出力型（機能 001 で使う分だけ。temp/solver-types.ts が移設元）。
 * API（OpenAPI 生成型）には依存しない。
 */

type Brand<T, B extends string> = T & { readonly __brand: B }

export type SkillId = Brand<string, 'SkillId'>
export type ArmorId = Brand<string, 'ArmorId'>
export type DecorationId = Brand<string, 'DecorationId'>
export type Uuid = Brand<string, 'Uuid'>

export type ArmorPart = 'head' | 'chest' | 'arms' | 'waist' | 'legs'
export type SlotLevel = 1 | 2 | 3 | 4
export type SlotTarget = 'weapon' | 'armor'

/** スロット1つ。護石のスロット種別が確定していないため、スロット側に種別を持たせる */
export interface Slot {
  target: SlotTarget
  level: SlotLevel
}

export interface SkillLevel {
  skillId: SkillId
  level: number
}

export type SolverStatus = 'optimal' | 'infeasible'

/** 防具候補。部位の欄を持つ平らな配列で受け取る */
export interface SolverArmor {
  id: ArmorId
  part: ArmorPart
  slots: Slot[]
  skills: SkillLevel[]
  defense: number
}

export interface SolverDecoration {
  id: DecorationId
  target: SlotTarget
  slotLevel: SlotLevel
  skills: SkillLevel[]
}

export interface SolverCharm {
  id: Uuid
  slots: Slot[]
  skills: SkillLevel[]
}

/** 固定の武器（マスター参照は 003） */
export interface SolverWeapon {
  slots: Slot[]
  skills: SkillLevel[]
}

export interface SearchInput {
  /** 必須スキル（level は下限） */
  required: SkillLevel[]
  armors: SolverArmor[]
  charms: SolverCharm[]
  weapon: SolverWeapon
  decorations: SolverDecoration[]
  /** 既定 30 */
  maxResults?: number
}

export interface FoundBuild {
  armor: Record<ArmorPart, ArmorId>
  /** 護石候補が空なら null */
  charmId: Uuid | null
  decorations: { decorationId: DecorationId; count: number }[]
  /** 防具の防御力の合計 */
  defense: number
}

export interface SearchResult {
  status: SolverStatus
  /** 見つかった順 */
  builds: FoundBuild[]
}
