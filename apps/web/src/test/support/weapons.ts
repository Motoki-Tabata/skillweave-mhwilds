import type { MasterBundle, MasterWeapon, SetBonus, SetBonusId } from '@swv/data'
import type { StoredWeapon, WeaponPayload } from '@/lib/weapons/types'
import { NAMES, makeBundle, sk, wp } from './fixtures'

export const sb = (id: string) => `sb:${id}` as SetBonusId

export const ARTIA_GREAT_SWORD = wp('great-sword:artia2')
export const ARTIA_BOW = wp('bow:artia1')
export const SERIES_BONUS = sb('series')
export const GROUP_BONUS = sb('group')
/** スキルの種別が武器スキルの setBonus（種別違いの確認用） */
export const WRONG_KIND_BONUS = sb('weapon-kind')

const artia = (id: string, weaponType: string): MasterWeapon => ({
  id: wp(id),
  weaponType,
  attack: 100,
  affinity: 0,
  slots: [],
  skills: [],
  setBonusIds: [],
})

const SET_BONUSES: SetBonus[] = [
  { id: SERIES_BONUS, skillId: sk('s1'), thresholds: [{ pieces: 2, level: 1 }] },
  { id: GROUP_BONUS, skillId: sk('g1'), thresholds: [{ pieces: 3, level: 1 }] },
  { id: WRONG_KIND_BONUS, skillId: sk('w1'), thresholds: [{ pieces: 2, level: 1 }] },
]

/** アーティア武器（大剣・弓）と、シリーズ／グループの setBonuses を足したテスト用のマスター。 */
export function makeWeaponBundle(): MasterBundle {
  const bundle = makeBundle()
  return {
    ...bundle,
    weapons: [
      ...bundle.weapons,
      artia('great-sword:artia2', 'great-sword'),
      artia('bow:artia1', 'bow'),
    ],
    setBonuses: SET_BONUSES,
  }
}

export const WEAPON_NAMES: Record<string, string> = {
  ...NAMES,
  [ARTIA_GREAT_SWORD]: 'アーティアブレイドⅡ',
  [ARTIA_BOW]: 'アーティアボウⅠ',
}

export const weaponNameOf = (id: string): string => WEAPON_NAMES[id] ?? id

export function makePayload(overrides: Partial<WeaponPayload> = {}): WeaponPayload {
  return {
    baseWeaponId: ARTIA_GREAT_SWORD,
    name: '巨戟ブレイド',
    attack: 200,
    affinity: 15,
    element: { type: 'fire', value: 30 },
    slots: [
      { target: 'weapon', level: 3 },
      { target: 'weapon', level: 1 },
    ],
    seriesBonusId: SERIES_BONUS,
    groupBonusId: GROUP_BONUS,
    ...overrides,
  }
}

export function makeStoredWeapon(
  id: string,
  overrides: Partial<WeaponPayload> = {},
  schemaVersion = 1,
): StoredWeapon {
  return {
    id,
    payload: makePayload(overrides),
    schemaVersion,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}
