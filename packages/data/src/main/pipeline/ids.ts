import type {
  ArmorId,
  ArmorPart,
  CharmId,
  DecorationId,
  SetBonusId,
  SkillId,
  WeaponId,
} from '../index.ts'

/** マスターの ID の生成。gameId から作り、MHDB の `id` は使わない */
export const skillId = (gameId: number | string): SkillId => `sk:${gameId}` as SkillId

export const setBonusId = (skillGameId: number | string): SetBonusId =>
  `sb:${skillGameId}` as SetBonusId

export const armorId = (armorSetGameId: number | string, part: ArmorPart): ArmorId =>
  `ar:${armorSetGameId}:${part}` as ArmorId

export const decorationId = (gameId: number | string): DecorationId =>
  `dc:${gameId}` as DecorationId

export const weaponId = (weaponType: string, gameId: number | string): WeaponId =>
  `wp:${weaponType}:${gameId}` as WeaponId

export const charmId = (gameId: number | string, rank: number): CharmId =>
  `ch:${gameId}:${rank}` as CharmId
