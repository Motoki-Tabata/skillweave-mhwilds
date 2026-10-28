import { describe, expect, it } from 'vitest'
import {
  formatDateTime,
  formatAffinityPercent,
  formatDamageValue,
  formatMultiplier,
  formatSlotLevels,
  formatWeaponStats,
} from '@/lib/format'
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

// 受入基準 5（火力の丸め。丸めは表示だけ）
describe('火力の丸め', () => {
  it('期待値・攻撃力は小数第1位に四捨五入する（312.45 → 312.5）', () => {
    expect(formatDamageValue(312.45)).toBe('312.5')
    expect(formatDamageValue(300)).toBe('300.0')
  })

  it('会心率は整数の % にし、負の値は半角の - を付ける（-15.5 → -16%）', () => {
    expect(formatAffinityPercent(-15.5)).toBe('-16%')
    expect(formatAffinityPercent(25)).toBe('25%')
  })

  it('会心倍率は小数第2位。10進の表記で丸める（1.005 → 1.01、1.4 → 1.40）', () => {
    expect(formatMultiplier(1.005)).toBe('1.01')
    expect(formatMultiplier(1.4)).toBe('1.40')
  })

  it('-0 を出さない（-0.04 → 0.0）', () => {
    expect(formatDamageValue(-0.04)).toBe('0.0')
  })
})

// 011 AC-3（保存日時をブラウザのローカル時刻で出す）
describe('formatDateTime', () => {
  it('ローカル時刻の YYYY/MM/DD hh:mm にし、1 桁は 0 で埋める', () => {
    const local = new Date(2026, 0, 5, 3, 7)
    expect(formatDateTime(local.toISOString())).toBe('2026/01/05 03:07')
  })
})
