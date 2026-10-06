/**
 * @swv/data の入口。マスターデータ（MasterBundle）と辞書の型だけを定義する。
 *
 * この入口は import 文を持たない。利用側（ブラウザ・ソルバー）が Node の API や
 * `.ts` 拡張子の import を許す設定を持たなくても、型を読めるようにするため。
 * パイプラインの実装は `pipeline/` に置き、型はここから `import type` で読む。
 */

type Brand<T, B extends string> = T & { readonly __brand: B }

// マスターIDはゲーム内ID（gameId）から機械的に作る。表示名から作ると翻訳修正で変わるため。
export type MasterVersion = Brand<string, 'MasterVersion'> // 例: "2026.10.1"
export type SkillId = Brand<string, 'SkillId'> // 例: "sk:850626240"
export type ArmorId = Brand<string, 'ArmorId'> // 例: "ar:-2117203456:head"（防具セットのgameId＋部位）
export type DecorationId = Brand<string, 'DecorationId'> // 例: "dc:-2144349312"
export type WeaponId = Brand<string, 'WeaponId'> // 例: "wp:charge-blade:22"（gameIdは武器種内でのみ一意）
export type CharmId = Brand<string, 'CharmId'> // 生産護石。例: "ch:-2084662144:1"（gameId＋ランク）
export type SetBonusId = Brand<string, 'SetBonusId'> // 例: "sb:-1432692352"（シリーズ／グループスキルのgameId）
export type ConditionId = Brand<string, 'ConditionId'> // 例: "cond.monster_enraged"

export type ArmorRank = 'low' | 'high' | 'master'
export type ArmorPart = 'head' | 'chest' | 'arms' | 'waist' | 'legs'
export type SlotLevel = 1 | 2 | 3 | 4
export type SlotTarget = 'weapon' | 'armor' // 武器用珠／防具用珠

/** スロット1つ。護石のスロット種別が確定していないため、部位側ではなくスロット側に種別を持たせる */
export interface Slot {
  target: SlotTarget
  level: SlotLevel
}

export interface SkillLevel {
  skillId: SkillId
  level: number // 1以上
}

export type SkillKind = 'weapon' | 'armor' | 'series' | 'group'

/** 火力計算用の効果。データ駆動にして、スキル追加でコードを変えずに済むようにする */
export type EffectStat =
  | 'attack_add'
  | 'attack_mul'
  | 'affinity_add'
  | 'crit_mul' // 会心倍率
  | 'element_add'
  | 'element_mul'

export interface Effect {
  stat: EffectStat
  value: number
  /** 発動条件。未指定なら常時。条件の有無はユーザーがトグルで決める */
  conditionId?: ConditionId
}

export interface MasterSkill {
  id: SkillId
  kind: SkillKind
  maxLevel: number
  /** index 0 = Lv1 の効果。火力に関係しないスキルは空配列。手作業のオーバーレイで埋める */
  effectsByLevel: Effect[][]
  /** 極意スキル（アセンダンスで復活予定）：発動中は対象スキルの上限が maxLevel になる。002 では出力しない */
  raisesMaxLevel?: { skillId: SkillId; maxLevel: number }
}

/** シリーズスキル・グループスキル：同じセットの部位数に応じてスキルが付く */
export interface SetBonus {
  id: SetBonusId
  skillId: SkillId
  /** 例: [{ pieces: 2, level: 1 }, { pieces: 4, level: 2 }] */
  thresholds: { pieces: number; level: number }[]
}

export interface MasterArmor {
  id: ArmorId
  part: ArmorPart
  rarity: number
  rank: ArmorRank
  slots: Slot[]
  skills: SkillLevel[]
  setBonusIds: SetBonusId[] // シリーズ・グループの両方を入れる
  defense: number
}

export interface MasterDecoration {
  id: DecorationId
  target: SlotTarget
  slotLevel: SlotLevel
  skills: SkillLevel[] // 複合珠に備えて配列
}

/** 生産護石（スキル固定）。所持していれば所持護石としてソルバーに渡す */
export interface MasterCharm {
  id: CharmId
  rarity: number
  skills: SkillLevel[]
  slots: Slot[]
}

/**
 * 鑑定護石の抽選テーブル（レア度ごとのスキル枠グループとスロットパターン）。
 * 手入力・OCR結果の妥当性チェックと、フェーズ③の逆引きに使う。ソルバー本体は使わない。
 */
export interface AppraisedCharmPattern {
  rarity: number
  /** スキル1〜3それぞれに入りうるスキルグループ（null は枠なし） */
  skillGroups: (string | null)[]
  slotPatterns: Slot[][]
}

export interface CharmSkillGroup {
  group: string // 例: "A"
  skills: SkillLevel[] // このグループから出うるスキルとレベル
}

export interface MasterWeapon {
  id: WeaponId
  weaponType: string // MHDB の kind（例: "charge-blade"）
  attack: number
  affinity: number
  element?: { type: string; value: number }
  slots: Slot[]
  skills: SkillLevel[]
  setBonusIds: SetBonusId[]
}

export interface MasterBundle {
  version: MasterVersion
  /** 取得元（MHDB のリポジトリとコミット SHA） */
  source: { repository: string; commit: string }
  skills: MasterSkill[]
  setBonuses: SetBonus[]
  armors: MasterArmor[]
  decorations: MasterDecoration[]
  weapons: MasterWeapon[]
  charms: MasterCharm[]
  appraisedCharm: {
    patterns: AppraisedCharmPattern[]
    groups: CharmSkillGroup[]
  }
}

/** 辞書の1項目。名前と説明文は MasterBundle に入れず、ID をキーにしてここへ分ける */
export interface DictionaryEntry {
  name: string
  description?: string
  /** index 0 = Lv1。スキルだけが持つ */
  levelDescriptions?: string[]
}

export interface MasterDictionary {
  version: MasterVersion
  locale: 'ja' | 'en'
  entries: Record<string, DictionaryEntry>
}
