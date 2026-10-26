import { describe, expect, it } from 'vitest'
import { payloadToDraft } from '@/lib/weapons/input'
import {
  isArtiaWeapon,
  validatePayload,
  validateWeapon,
  weaponEligibility,
} from '@/lib/weapons/validate'
import type { WeaponDraft } from '@/lib/weapons/types'
import {
  ARTIA_BOW,
  GROUP_BONUS,
  SERIES_BONUS,
  WRONG_KIND_BONUS,
  makePayload,
  makeWeaponBundle,
  weaponNameOf,
} from '../../support/weapons'
import { wp } from '../../support/fixtures'

const ctx = { bundle: makeWeaponBundle(), nameOf: weaponNameOf }
const valid = (): WeaponDraft => payloadToDraft(makePayload())
const errorsOf = (changes: Partial<WeaponDraft>) =>
  validateWeapon({ ...valid(), ...changes }, ctx).map((e) => [e.field, e.index, e.code, e.message])

// 受入基準 1（アーティア武器を基にする）
describe('isArtiaWeapon', () => {
  it('辞書の名前が「アーティア」で始まる武器だけがアーティア武器', () => {
    const byId = (id: string) => ctx.bundle.weapons.find((w) => w.id === id)!
    expect(isArtiaWeapon(byId(ARTIA_BOW), weaponNameOf)).toBe(true)
    expect(isArtiaWeapon(byId(wp('great-sword:1')), weaponNameOf)).toBe(false)
  })
})

// 受入基準 5（構造上の制約に反する保存の拒否と、反する項目の提示）
describe('validateWeapon', () => {
  it('制約に反しない入力はエラーなし（属性なし・スロットなし・付与スキルなしも可）', () => {
    expect(errorsOf({})).toEqual([])
    expect(
      errorsOf({
        elementType: null,
        elementValue: '',
        slots: [],
        seriesBonusId: null,
        groupBonusId: null,
        name: '',
      }),
    ).toEqual([])
  })

  it('基の武器が未選択・アーティア武器でない・マスターに無い', () => {
    expect(errorsOf({ baseWeaponId: null })).toEqual([
      ['baseWeapon', 0, 'base-missing', '基の武器を選んでください。'],
    ])
    const expected = [
      [
        'baseWeapon',
        0,
        'base-unknown',
        'この基の武器は現行のマスターにありません。選び直してください。',
      ],
    ]
    expect(errorsOf({ baseWeaponId: wp('great-sword:1') })).toEqual(expected)
    expect(errorsOf({ baseWeaponId: wp('gone') })).toEqual(expected)
  })

  it('名前は前後の空白を除いて 30 文字（コードポイント）まで', () => {
    expect(errorsOf({ name: ` ${'あ'.repeat(30)} ` })).toEqual([])
    expect(errorsOf({ name: '𠮷'.repeat(30) })).toEqual([])
    expect(errorsOf({ name: 'あ'.repeat(31) })).toEqual([
      ['name', 0, 'name', '名前は 30 文字以内で入力してください。'],
    ])
  })

  it('攻撃力は空・範囲外・整数でないでエラー（1〜999 は可）', () => {
    expect(errorsOf({ attack: '' })[0]).toEqual([
      'attack',
      0,
      'attack-empty',
      '攻撃力を入力してください。',
    ])
    const range = [['attack', 0, 'attack-range', '攻撃力は 1〜999 の整数で入力してください。']]
    for (const attack of ['0', '1000', '1.5', 'abc', '-1'])
      expect(errorsOf({ attack })).toEqual(range)
    expect(errorsOf({ attack: '１' })).toEqual([])
    expect(errorsOf({ attack: '999' })).toEqual([])
  })

  it('会心率は空・範囲外でエラー（-100〜100 は可）', () => {
    expect(errorsOf({ affinity: '' })[0]).toEqual([
      'affinity',
      0,
      'affinity-empty',
      '会心率を入力してください。',
    ])
    const range = [
      ['affinity', 0, 'affinity-range', '会心率は -100〜100 の整数で入力してください。'],
    ]
    for (const affinity of ['101', '-101', '5.5']) expect(errorsOf({ affinity })).toEqual(range)
    expect(errorsOf({ affinity: '－１００' })).toEqual([])
    expect(errorsOf({ affinity: '100' })).toEqual([])
  })

  it('属性は種類を選んだのに値が空・10 の倍数でない・範囲外でエラー', () => {
    expect(errorsOf({ elementValue: '' })).toEqual([
      ['element', 0, 'element-empty', '属性値を入力してください。'],
    ])
    const range = [
      ['element', 0, 'element-range', '属性値は 10〜990 の 10 の倍数で入力してください。'],
    ]
    for (const elementValue of ['15', '0', '1000', '-10', 'x']) {
      expect(errorsOf({ elementValue })).toEqual(range)
    }
    expect(errorsOf({ elementValue: '10' })).toEqual([])
    expect(errorsOf({ elementValue: '990' })).toEqual([])
    expect(errorsOf({ elementType: 'unknown' })[0]?.[2]).toBe('element-type')
  })

  it('空のスロットの下にスロットがあるとエラー。4 枠目は too-many', () => {
    expect(errorsOf({ slots: [3, null, 1] })).toEqual([
      [
        'slots',
        1,
        'slot-gap',
        'スロット2が「なし」です。スロットは上の行から順に入力してください。',
      ],
    ])
    expect(errorsOf({ slots: [1, 2, 3, 1] })[0]?.[2]).toBe('too-many')
    expect(errorsOf({ slots: [4] })[0]?.[2]).toBe('slot-level')
    expect(errorsOf({ slots: [3, null, null] })).toEqual([])
  })

  it('付与スキルは種別違い（series に group・weapon 種別）とマスターに無い ID でエラー', () => {
    const series = [
      [
        'seriesBonus',
        0,
        'series-unknown',
        'このシリーズスキルは現行のマスターにありません。別のスキルを選ぶか空にしてください。',
      ],
    ]
    expect(errorsOf({ seriesBonusId: GROUP_BONUS })).toEqual(series)
    expect(errorsOf({ seriesBonusId: WRONG_KIND_BONUS })).toEqual(series)
    expect(errorsOf({ seriesBonusId: 'sb:gone' as never })).toEqual(series)
    expect(errorsOf({ groupBonusId: SERIES_BONUS })).toEqual([
      [
        'groupBonus',
        0,
        'group-unknown',
        'このグループスキルは現行のマスターにありません。別のスキルを選ぶか空にしてください。',
      ],
    ])
  })

  it('複数の違反は項目の順に返す', () => {
    const fields = validateWeapon(
      { ...valid(), baseWeaponId: null, attack: '0', affinity: '', slots: [null, 1] },
      ctx,
    ).map((e) => e.field)
    expect(fields).toEqual(['baseWeapon', 'attack', 'affinity', 'slots'])
  })
})

describe('validatePayload（マスターに依らない構造の検証）', () => {
  it('範囲・個数・スロットの種別を検査し、マスターに無い ID は問わない', () => {
    expect(validatePayload(makePayload())).toEqual([])
    expect(validatePayload(makePayload({ baseWeaponId: wp('gone') }))).toEqual([])
    expect(validatePayload(makePayload({ attack: 1000 })).map((e) => e.code)).toEqual([
      'attack-range',
    ])
    expect(validatePayload(makePayload({ element: { type: 'fire', value: 100 } }))).toHaveLength(1)
    expect(validatePayload(makePayload({ element: { type: 'fire', value: 1.5 } }))).toHaveLength(1)
    const four = Array.from({ length: 4 }, () => ({ target: 'weapon' as const, level: 1 as const }))
    expect(validatePayload(makePayload({ slots: four })).map((e) => e.code)).toEqual(['too-many'])
    const armor = [{ target: 'armor', level: 1 }] as never
    expect(validatePayload(makePayload({ slots: armor })).map((e) => e.code)).toEqual([
      'slot-target',
    ])
  })
})

// 受入基準 10（マスターに無い基の武器・付与スキルは検索の選択肢から外す）
describe('weaponEligibility', () => {
  it('基の武器・付与スキルが現行のマスターにあれば候補になる', () => {
    expect(weaponEligibility(makePayload(), ctx)).toEqual({ eligible: true })
    expect(
      weaponEligibility(makePayload({ seriesBonusId: null, groupBonusId: null }), ctx),
    ).toEqual({ eligible: true })
  })

  it('3つの理由を、基の武器・シリーズ・グループの順に返す', () => {
    expect(
      weaponEligibility(
        makePayload({
          baseWeaponId: wp('gone'),
          seriesBonusId: 'sb:gone' as never,
          groupBonusId: 'sb:gone' as never,
        }),
        ctx,
      ),
    ).toEqual({
      eligible: false,
      reasons: [
        '基の武器が現行のマスターにありません。',
        'シリーズスキルが現行のマスターにありません。',
        'グループスキルが現行のマスターにありません。',
      ],
    })
  })

  it('アーティア武器でない基の武器と、種別の違う付与スキルも外す', () => {
    expect(
      weaponEligibility(
        makePayload({ baseWeaponId: wp('great-sword:1'), seriesBonusId: GROUP_BONUS }),
        ctx,
      ),
    ).toEqual({
      eligible: false,
      reasons: [
        '基の武器が現行のマスターにありません。',
        'シリーズスキルが現行のマスターにありません。',
      ],
    })
  })
})
