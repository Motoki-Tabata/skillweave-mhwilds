import { describe, expect, it } from 'vitest'
import { draftToPayload, payloadToDraft, readInteger } from '@/lib/weapons/input'
import type { WeaponDraft } from '@/lib/weapons/types'
import { ARTIA_GREAT_SWORD, GROUP_BONUS, SERIES_BONUS, makePayload } from '../../support/weapons'

// 受入基準 1（装備画面に出る値のまま入力する）
describe('readInteger', () => {
  it('全角の数字と「－」を半角に直し、前後の空白を除いて整数として読む', () => {
    expect(readInteger('２００')).toBe(200)
    expect(readInteger('－１５')).toBe(-15)
    expect(readInteger('  -5 ')).toBe(-5)
    expect(readInteger('0')).toBe(0)
  })

  it('整数の形でなければ null', () => {
    for (const text of ['', ' ', '1.5', '1e3', 'abc', '--1', '1 2', '+3']) {
      expect(readInteger(text)).toBeNull()
    }
  })
})

describe('draftToPayload / payloadToDraft', () => {
  const draft: WeaponDraft = {
    baseWeaponId: ARTIA_GREAT_SWORD,
    name: '  巨戟  ',
    attack: '２００',
    affinity: '－１５',
    elementType: 'fire',
    elementValue: '300',
    slots: [3, null, null],
    seriesBonusId: SERIES_BONUS,
    groupBonusId: GROUP_BONUS,
  }

  it('属性値は表示値 ÷ 10 で保存し、名前は前後の空白を除き、空のスロットは除く', () => {
    expect(draftToPayload(draft)).toEqual({
      baseWeaponId: ARTIA_GREAT_SWORD,
      name: '巨戟',
      attack: 200,
      affinity: -15,
      element: { type: 'fire', value: 30 },
      slots: [{ target: 'weapon', level: 3 }],
      seriesBonusId: SERIES_BONUS,
      groupBonusId: GROUP_BONUS,
    })
  })

  it('属性が「なし」なら element の項目を出さない', () => {
    expect(draftToPayload({ ...draft, elementType: null, elementValue: '' })).not.toHaveProperty(
      'element',
    )
  })

  it('フォームへ読み込むときは属性値を表示値（× 10）にする', () => {
    const loaded = payloadToDraft(makePayload())
    expect(loaded.elementValue).toBe('300')
    expect(loaded.attack).toBe('200')
    expect(loaded.slots).toEqual([3, 1])
    expect(payloadToDraft(makePayload({ element: undefined })).elementType).toBeNull()
  })
})
