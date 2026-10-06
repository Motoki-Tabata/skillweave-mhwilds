import type { ArmorRank } from '../index.ts'

/** 人が書く設定。MHDB の取得元と、生成するマスターの版 */
export const MHDB_REPOSITORY = 'LartTyler/mhdb-wilds-data'
export const MHDB_COMMIT = 'c50a1eb892f4a1ad9bb35c147801658804be2cc2'
export const MASTER_VERSION = '2026.10.2'

/** 防具のレア度とランクの対応表。表に無いレア度の防具があれば生成を失敗させる */
export const ARMOR_RANK_BY_RARITY: Readonly<Record<number, ArmorRank>> = {
  1: 'low',
  2: 'low',
  3: 'low',
  4: 'low',
  5: 'high',
  6: 'high',
  7: 'high',
  8: 'high',
}
