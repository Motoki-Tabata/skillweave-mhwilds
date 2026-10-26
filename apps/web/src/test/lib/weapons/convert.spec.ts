import { describe, expect, it } from 'vitest'
import {
  MISSING_BASE_WEAPON_NAME,
  toSolverWeapon,
  weaponBonusLabels,
  weaponDisplayName,
  weaponSpecLine,
  weaponTypeLabel,
} from '@/lib/weapons/convert'
import { wp } from '../../support/fixtures'
import {
  ARTIA_GREAT_SWORD,
  GROUP_BONUS,
  SERIES_BONUS,
  makePayload,
  makeStoredWeapon,
  makeWeaponBundle,
  weaponNameOf,
} from '../../support/weapons'

const ctx = { bundle: makeWeaponBundle(), nameOf: weaponNameOf }

// 受入基準 7（kind: 'custom' の SolverWeapon として渡し、武器スキルは空にする）
describe('toSolverWeapon', () => {
  it('基の武器・攻撃力・会心率・属性・スロット・付与スキルのシリーズ→グループの ID を写し、武器スキルは空', () => {
    expect(toSolverWeapon(makeStoredWeapon('w1'))).toEqual({
      kind: 'custom',
      id: 'w1',
      baseWeaponId: ARTIA_GREAT_SWORD,
      attack: 200,
      affinity: 15,
      element: { type: 'fire', value: 30 },
      slots: [
        { target: 'weapon', level: 3 },
        { target: 'weapon', level: 1 },
      ],
      skills: [],
      setBonusIds: [SERIES_BONUS, GROUP_BONUS],
    })
  })

  it('null の付与スキルは含めず、属性が無ければ element の項目を出さない', () => {
    const weapon = toSolverWeapon(
      makeStoredWeapon('w1', { element: undefined, seriesBonusId: null }),
    )
    expect(weapon).not.toHaveProperty('element')
    expect(weapon).toMatchObject({ setBonusIds: [GROUP_BONUS] })
  })

  it('保存した値を共有せずにコピーする', () => {
    const stored = makeStoredWeapon('w1')
    const weapon = toSolverWeapon(stored)
    stored.payload.slots[0].level = 1
    expect(weapon.kind === 'custom' && weapon.slots[0].level).toBe(3)
  })
})

// 受入基準 4（名前・武器種・攻撃力・会心率・属性・スロット・付与スキルの表示）
describe('表示用の文字列', () => {
  it('名前が空なら基の武器の名前、基の武器もマスターに無ければ代わりの文言', () => {
    expect(weaponDisplayName(makePayload(), ctx)).toBe('巨戟ブレイド')
    expect(weaponDisplayName(makePayload({ name: '' }), ctx)).toBe('アーティアブレイドⅡ')
    expect(weaponDisplayName(makePayload({ name: '', baseWeaponId: wp('gone') }), ctx)).toBe(
      MISSING_BASE_WEAPON_NAME,
    )
    expect(MISSING_BASE_WEAPON_NAME).toBe('（基の武器が見つかりません）')
  })

  it('武器種は基の武器から。マスターに無ければ null', () => {
    expect(weaponTypeLabel(makePayload(), ctx)).toBe('大剣')
    expect(weaponTypeLabel(makePayload({ baseWeaponId: wp('gone') }), ctx)).toBeNull()
  })

  it('性能の行。属性値は装備画面の表示値（× 10）', () => {
    expect(weaponSpecLine(makePayload())).toBe(
      '攻撃力 200 ／ 会心 15% ／ 火属性 300 ／ スロット Lv3・Lv1',
    )
    expect(weaponSpecLine(makePayload({ element: undefined, slots: [], affinity: -5 }))).toBe(
      '攻撃力 200 ／ 会心 -5% ／ スロット なし',
    )
  })

  it('付与スキルはシリーズ→グループの順に「<名前>（シリーズ）」「<名前>（グループ）」', () => {
    expect(weaponBonusLabels(makePayload(), ctx)).toEqual([
      '火竜の力（シリーズ）',
      '不屈の極み（グループ）',
    ])
    expect(
      weaponBonusLabels(makePayload({ seriesBonusId: null, groupBonusId: null }), ctx),
    ).toEqual([])
    expect(weaponBonusLabels(makePayload({ groupBonusId: null }), ctx)).toEqual([
      '火竜の力（シリーズ）',
    ])
  })
})
