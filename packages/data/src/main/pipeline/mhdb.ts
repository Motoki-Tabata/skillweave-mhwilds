/** MHDB（統合 JSON）の入力の型。使う項目だけを書く */

export type MhdbNames = Record<string, string>

export interface MhdbSkillRank {
  level: number
  descriptions?: MhdbNames
}

export interface MhdbSkill {
  game_id: number
  names: MhdbNames
  descriptions?: MhdbNames
  ranks: MhdbSkillRank[]
  kind: string // armor・weapon・set・group
}

export interface MhdbBonusRank {
  pieces: number
  skill_level: number
}

export interface MhdbBonus {
  skill_id: number
  ranks: MhdbBonusRank[]
}

export interface MhdbArmorPiece {
  kind: string // head・chest・arms・waist・legs
  names: MhdbNames
  descriptions?: MhdbNames
  defense: { base: number; max: number }
  slots: number[]
  skills: Record<string, number>
}

export interface MhdbArmorSet {
  game_id: number
  rarity: number
  set_bonus: MhdbBonus | null
  group_bonus: MhdbBonus | null
  pieces: MhdbArmorPiece[]
}

export interface MhdbAccessory {
  game_id: number
  names: MhdbNames
  descriptions?: MhdbNames
  level: number
  skills: Record<string, number>
  allowed_on: string // weapon・armor
}

export interface MhdbAmuletRank {
  names: MhdbNames
  descriptions?: MhdbNames
  rarity: number
  level: number
  skills: Record<string, number>
}

export interface MhdbAmulet {
  game_id: number
  is_random: boolean
  ranks: MhdbAmuletRank[]
}

export interface MhdbWeaponSpecial {
  kind: string // element・status
  element?: string
  status?: string
  raw: number
  hidden: boolean
}

export interface MhdbWeapon {
  game_id: number
  kind: string // 例: charge-blade
  names: MhdbNames
  descriptions?: MhdbNames
  attack_raw: number
  affinity: number
  slots: number[]
  specials: MhdbWeaponSpecial[]
  skills: Record<string, number>
}

/** 取得した MHDB の全体。武器は14ファイルを1つの配列にまとめる */
export interface MhdbInput {
  skills: MhdbSkill[]
  armors: MhdbArmorSet[]
  accessories: MhdbAccessory[]
  amulets: MhdbAmulet[]
  weapons: MhdbWeapon[]
}
