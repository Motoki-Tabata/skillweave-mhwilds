import { describe, expect, it } from 'vitest'
import { CHARM_MATCH_LABELS, CHARM_RARITIES, CHARM_SLOT_OPTIONS } from '@/constants/charms'

// 受入基準 1・6・7（入力の選択肢と照合の結果の表示名）
describe('charms constants', () => {
  it('鑑定護石のレア度は 5〜8', () => {
    expect(CHARM_RARITIES).toEqual([5, 6, 7, 8])
  })

  it('スロットの選択肢は「なし」→武器用 Lv1〜3 →防具用 Lv1〜3', () => {
    expect(CHARM_SLOT_OPTIONS.map((o) => o.label)).toEqual([
      'なし',
      '武器用 Lv1',
      '武器用 Lv2',
      '武器用 Lv3',
      '防具用 Lv1',
      '防具用 Lv2',
      '防具用 Lv3',
    ])
    expect(CHARM_SLOT_OPTIONS[0].slot).toBeNull()
    expect(CHARM_SLOT_OPTIONS[5].slot).toEqual({ target: 'armor', level: 2 })
  })

  it('照合の結果の表示名', () => {
    expect(CHARM_MATCH_LABELS).toEqual({
      pass: '合格',
      mismatch: 'テーブル不一致',
      unchecked: '未検査',
    })
  })
})
