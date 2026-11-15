import { describe, expect, it } from 'vitest'
import type { ConditionId, Effect } from '@swv/data'
import { summarizeEffects } from '@/lib/skills/effectSummary'
import { NAMES, cd } from '../../support/fixtures'
import { bundle, skillByName } from '../../support/masterFixture'

const name = (id: ConditionId) => NAMES[id] ?? id

// 受入基準 9（補完を、そのレベルの効果をすべて使って作る）
describe('summarizeEffects', () => {
  it('攻撃 Lv5: 常時の効果を「・」でつなぎ、倍率は小数第2位、加算は符号付き', () => {
    const effects: Effect[] = [
      { stat: 'attack_mul', value: 1.04 },
      { stat: 'attack_add', value: 9 },
    ]
    expect(summarizeEffects(effects, name)).toBe('効果: 攻撃力 ×1.04・攻撃力 +9')
  })

  it('弱点特効 Lv5: 条件ごとの組を「 ／ 」でつなぎ、条件の名前を添える', () => {
    const effects: Effect[] = [
      { stat: 'affinity_add', value: 30, conditionId: cd('weak_point') },
      { stat: 'affinity_add', value: 20, conditionId: cd('wound') },
    ]
    expect(summarizeEffects(effects, name)).toBe(
      '効果: 会心率 +30%（有効部位への攻撃） ／ 会心率 +20%（傷口への攻撃）',
    )
  })

  it('挑戦者 Lv5: 同じ条件の効果は1つの組にまとめる。常時の組と混ぜても組は最初に出た順', () => {
    const effects: Effect[] = [
      { stat: 'attack_add', value: 20, conditionId: cd('challenger') },
      { stat: 'affinity_add', value: 15, conditionId: cd('challenger') },
    ]
    expect(summarizeEffects(effects, name)).toBe('効果: 攻撃力 +20・会心率 +15%（挑戦者の発動中）')
    const mixed: Effect[] = [
      { stat: 'attack_add', value: 1, conditionId: cd('wound') },
      { stat: 'attack_add', value: 2 },
      { stat: 'crit_mul', value: 1.4, conditionId: cd('wound') },
    ]
    expect(summarizeEffects(mixed, name)).toBe(
      '効果: 攻撃力 +1・会心倍率 1.40（傷口への攻撃） ／ 攻撃力 +2',
    )
  })

  it('属性値の効果と負の加算も出す', () => {
    const effects: Effect[] = [
      { stat: 'element_add', value: 5 },
      { stat: 'element_mul', value: 1.1 },
      { stat: 'attack_add', value: -5 },
    ]
    expect(summarizeEffects(effects, name)).toBe('効果: 属性値 +50・属性値 ×1.10・攻撃力 -5')
  })

  // AC-9: 種類と区別の組ごとの書式（screen-design §2 の表）
  it.each<[Effect, string]>([
    [{ stat: 'element_add', value: 6, element: 'fire' }, '効果: 火属性値 +60'],
    [{ stat: 'element_mul', value: 1.2, element: 'fire' }, '効果: 火属性値 ×1.20'],
    [{ stat: 'status_add', value: 5, element: 'poison' }, '効果: 毒属性値 +50'],
    [{ stat: 'status_mul', value: 1.2, element: 'blastblight' }, '効果: 爆破属性値 ×1.20'],
    [{ stat: 'status_add', value: 5 }, '効果: 状態異常値 +50'],
    [{ stat: 'status_mul', value: 1.2 }, '効果: 状態異常値 ×1.20'],
    [{ stat: 'defense_add', value: 35 }, '効果: 防御力 +35'],
    [{ stat: 'defense_mul', value: 1.1 }, '効果: 防御力 ×1.10'],
    [{ stat: 'resistance_add', value: 20, element: 'fire' }, '効果: 火耐性 +20'],
    [{ stat: 'resistance_add', value: 5, element: 'all' }, '効果: 全属性耐性 +5'],
    [{ stat: 'element_crit_mul', value: 1.35 }, '効果: 属性の会心倍率 1.35'],
    [{ stat: 'status_crit_mul', value: 1.2 }, '効果: 状態異常の会心倍率 1.20'],
  ])('AC-9: %j の補完', (effect, expected) => {
    expect(summarizeEffects([effect], name)).toBe(expected)
  })

  it('AC-9: 属性値の加算は × 10 の表示値で、浮動小数の誤差を出さない', () => {
    expect(summarizeEffects([{ stat: 'element_add', value: 0.5 }], name)).toBe('効果: 属性値 +5')
    expect(summarizeEffects([{ stat: 'element_add', value: 0.1 + 0.2 }], name)).toBe(
      '効果: 属性値 +3',
    )
  })

  it('効果が無いレベルは null（補完を出さない）', () => {
    expect(summarizeEffects([], name)).toBeNull()
  })

  // AC-9: 実データのマスターの効果から、説明文と同じ数字の補完が出る（screen-design §2.1）
  it.each<[string, number, string]>([
    ['火属性攻撃強化', 1, '効果: 火属性値 +40'],
    ['火属性攻撃強化', 3, '効果: 火属性値 ×1.20・火属性値 +60'],
    ['毒属性強化', 3, '効果: 毒属性値 ×1.20・毒属性値 +50'],
    ['防御', 2, '効果: 防御力 +10'],
    ['防御', 7, '効果: 防御力 ×1.10・防御力 +35・全属性耐性 +5'],
    ['火耐性', 1, '効果: 火耐性 +6'],
    ['火耐性', 3, '効果: 火耐性 +20・防御力 +10'],
  ])('AC-9: 実データ %s Lv%i', (skillName, level, expected) => {
    const id = skillByName(skillName).id
    const effects = bundle.skills.find((s) => s.id === id)?.effectsByLevel[level - 1] ?? []
    expect(summarizeEffects(effects, name)).toBe(expected)
  })
})
