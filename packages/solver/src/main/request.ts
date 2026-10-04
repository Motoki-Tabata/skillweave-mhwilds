/**
 * packages/solver の入出力型（temp/solver-types.ts の入出力・メッセージ部分が移設元）。
 * マスター由来の型は @swv/data から型だけを読む。API（OpenAPI 生成型）には依存しない。
 */
import type {
  ArmorId,
  ArmorPart,
  ConditionId,
  DecorationId,
  MasterVersion,
  SetBonusId,
  SkillId,
  SkillLevel,
  Slot,
  WeaponId,
} from '@swv/data'

/** ユーザーデータの ID（UUIDv7・クライアント採番） */
export type Uuid = string & { readonly __brand: 'Uuid' }

export interface SolverCharm {
  id: Uuid
  rarity: number
  skills: SkillLevel[]
  slots: Slot[]
}

/** 武器は固定で渡す */
export type SolverWeapon =
  | { kind: 'master'; weaponId: WeaponId }
  | {
      kind: 'custom' // アーティア等の個体差のある武器
      id: Uuid
      baseWeaponId: WeaponId
      attack: number
      affinity: number
      element?: { type: string; value: number }
      slots: Slot[]
      skills: SkillLevel[]
      setBonusIds: SetBonusId[]
    }

export type Objective =
  | { kind: 'feasible' } // 条件を満たす構成を列挙するだけ
  | { kind: 'maximize'; metric: 'expectedDamage' | 'defense' | 'freeSlots' }

export interface SolverRequest {
  masterVersion: MasterVersion
  weapon: SolverWeapon
  charms: SolverCharm[] // 候補。空なら護石なしで解く
  required: SkillLevel[] // 必須スキル（level は下限）
  /** 部位を固定する。null は「何も付けない」 */
  fixedArmor?: Partial<Record<ArmorPart, ArmorId | null>>
  excludedArmorIds?: ArmorId[]
  /** 火力計算で「発動している」とみなす条件（003 では読まない） */
  activeConditionIds?: ConditionId[]
  objective: Objective
  maxResults: number
  timeoutMs: number
}

export type SlotOwner = 'weapon' | ArmorPart | 'charm'

export interface SlotRef {
  owner: SlotOwner
  index: number // その持ち主の slots[] の添字
}

export interface SolvedBuild {
  armor: Record<ArmorPart, ArmorId | null>
  charmId: Uuid | null
  decorations: { slot: SlotRef; decorationId: DecorationId }[]
  /** 発動スキル（maxLevel で頭打ちした後の値）と、頭打ち前の合計 */
  skills: { skillId: SkillId; level: number; rawLevel: number }[]
  freeSlots: SlotRef[]
  /** 目的関数が freeSlots のときだけ入れる、種別ごとの空き Lv の合計 */
  freeSlotLevels?: { armor: number; weapon: number }
  /** maximize のときの主目的の値（defense は防御力の合計、freeSlots は防具用の空き Lv の合計） */
  score?: number
}

export type SolverStatus = 'optimal' | 'feasible' | 'infeasible' | 'timeout'

export interface SolverResponse {
  status: SolverStatus
  builds: SolvedBuild[]
  elapsedMs: number
}

/** 求解の外部依存（時計・イベントループ・キャンセル・進捗）。src/main は setTimeout・performance を持たない */
export interface SolveOptions {
  now: () => number
  yieldControl: () => Promise<void>
  isCancelled?: () => boolean
  onProgress?: (found: number) => void
}
