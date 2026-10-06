import { describe, expect, it } from 'vitest'
import { formatSlotLevels, formatWeaponStats } from '@/lib/format'
import { makeBundle, wp } from '../support/fixtures'

// 受入基準 3（武器の表示）
describe('format', () => {
  const weapons = makeBundle().weapons

  it('スロットを「Lv3・Lv1」にする。無いときは「なし」', () => {
    expect(formatSlotLevels(weapons[0].slots)).toBe('Lv3・Lv1')
    expect(formatSlotLevels([])).toBe('なし')
  })

  it('武器の攻撃力・会心・スロットを1行にする', () => {
    const weapon = weapons.find((w) => w.id === wp('great-sword:1'))!
    expect(formatWeaponStats(weapon)).toBe('攻撃力 250 ／ 会心 -15% ／ スロット Lv3・Lv1')
  })
})
