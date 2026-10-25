import { describe, expect, it } from 'vitest'
import type { ConditionId, Effect } from '@swv/data'
import { summarizeEffects } from '@/lib/skills/effectSummary'
import { NAMES, cd } from '../../support/fixtures'

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
      { stat: 'element_add', value: 50 },
      { stat: 'element_mul', value: 1.1 },
      { stat: 'attack_add', value: -5 },
    ]
    expect(summarizeEffects(effects, name)).toBe('効果: 属性値 +50・属性値 ×1.10・攻撃力 -5')
  })

  it('効果が無いレベルは null（補完を出さない）', () => {
    expect(summarizeEffects([], name)).toBeNull()
  })
})
