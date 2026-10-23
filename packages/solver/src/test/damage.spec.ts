import { describe, expect, it } from 'vitest'
import { evaluateDamage } from '../main/damage'
import { buildMaster, conditionId, masterSkill, skill } from './support/builders'

const A = conditionId('cd:a')
const B = conditionId('cd:b')

const master = buildMaster({
  skills: [
    masterSkill('ATK', 'armor', 3, [
      [{ stat: 'attack_add', value: 5 }],
      [{ stat: 'attack_add', value: 10 }],
      [{ stat: 'attack_add', value: 15 }],
    ]),
    masterSkill('MUL', 'armor', 2, [
      [{ stat: 'attack_mul', value: 1.1 }],
      [{ stat: 'attack_mul', value: 1.2 }],
    ]),
    masterSkill('MUL2', 'armor', 1, [[{ stat: 'attack_mul', value: 1.5 }]]),
    masterSkill('AFF', 'armor', 3, [
      [{ stat: 'affinity_add', value: 10 }],
      [{ stat: 'affinity_add', value: 20 }],
      [{ stat: 'affinity_add', value: 30 }],
    ]),
    masterSkill('CM', 'weapon', 2, [
      [{ stat: 'crit_mul', value: 1.3 }],
      [{ stat: 'crit_mul', value: 1.4 }],
    ]),
    masterSkill('CM2', 'weapon', 1, [[{ stat: 'crit_mul', value: 1.35 }]]),
    masterSkill('COND', 'armor', 2, [
      [{ conditionId: A, stat: 'attack_add', value: 10 }],
      [
        { conditionId: A, stat: 'attack_add', value: 20 },
        { conditionId: B, stat: 'affinity_add', value: 20 },
      ],
    ]),
    masterSkill('EMPTY', 'armor', 3),
    masterSkill('SPARSE', 'armor', 3, [[], [{ stat: 'attack_add', value: 7 }]]),
  ],
  conditions: [{ id: A }, { id: B }],
})

const base = { attack: 200, affinity: 0 }
const evaluate = (
  skills: [string, number][],
  b = base,
  active?: Parameters<typeof evaluateDamage>[3],
) =>
  evaluateDamage(
    master,
    b,
    skills.map(([id, level]) => skill(id, level)),
    active,
  )

describe('[AC4] evaluateDamage は Q35 の式で期待値を計算する', () => {
  it('スキルなしは攻撃力そのもの（会心率 0）', () => {
    expect(evaluate([])).toEqual({
      attack: 200,
      affinity: 0,
      critMultiplier: 1.25,
      expectedDamage: 200,
    })
  })

  it('攻撃力 = 武器の攻撃力 × attack_mul の積 + attack_add の和', () => {
    const r = evaluate([
      ['MUL', 2],
      ['MUL2', 1],
      ['ATK', 3],
    ])
    expect(r.attack).toBeCloseTo(200 * 1.2 * 1.5 + 15, 10)
  })

  it('会心率 = 武器 + affinity_add の和、会心倍率の既定は 1.25', () => {
    const r = evaluate([['AFF', 2]], { attack: 100, affinity: 5 })
    expect(r.affinity).toBe(25)
    expect(r.critMultiplier).toBe(1.25)
    expect(r.expectedDamage).toBeCloseTo(100 * (1 + 0.25 * 0.25), 10)
  })

  it('crit_mul は有効なものの最大値を使い、スキルの並びに依存しない', () => {
    const r1 = evaluate([
      ['CM', 2],
      ['CM2', 1],
      ['AFF', 3],
    ])
    const r2 = evaluate([
      ['AFF', 3],
      ['CM2', 1],
      ['CM', 2],
    ])
    expect(r1.critMultiplier).toBe(1.4)
    expect(r1.expectedDamage).toBeCloseTo(200 * (1 + 0.3 * 0.4), 10)
    expect(r2).toEqual(r1)
  })

  it('期待値を丸めない', () => {
    const r = evaluate([['AFF', 1]], { attack: 123, affinity: 3 })
    expect(r.expectedDamage).toBe(123 * (1 + 0.13 * 0.25))
  })

  it('効果の無いスキル・効果の無いレベル・範囲外のレベル・マスターに無いスキルは数えない', () => {
    expect(evaluate([['EMPTY', 3]]).expectedDamage).toBe(200)
    expect(evaluate([['SPARSE', 1]]).attack).toBe(200)
    expect(evaluate([['SPARSE', 2]]).attack).toBe(207)
    expect(evaluate([['ATK', 4]]).attack).toBe(200)
    expect(evaluate([['ATK', 0]]).attack).toBe(200)
    expect(evaluate([['NOPE', 1]]).attack).toBe(200)
  })
})

describe('[AC5] 会心率の丸めと負会心', () => {
  it('+100 を超える会心率は 100 に丸める', () => {
    const r = evaluate([['AFF', 3]], { attack: 100, affinity: 90 })
    expect(r.affinity).toBe(100)
    expect(r.expectedDamage).toBeCloseTo(125, 10)
  })

  it('−100 を下回る会心率は −100 に丸める', () => {
    const r = evaluate([], { attack: 100, affinity: -250 })
    expect(r.affinity).toBe(-100)
    expect(r.expectedDamage).toBeCloseTo(75, 10)
  })

  it('負の会心率は会心倍率にかかわらず 0.75 倍側で計算する', () => {
    const plain = evaluate([['AFF', 1]], { attack: 100, affinity: -50 })
    expect(plain.affinity).toBe(-40)
    expect(plain.expectedDamage).toBeCloseTo(100 * (1 - 0.4 * 0.25), 10)
    const withCrit = evaluate(
      [
        ['AFF', 1],
        ['CM', 2],
      ],
      { attack: 100, affinity: -50 },
    )
    expect(withCrit.critMultiplier).toBe(1.4)
    expect(withCrit.expectedDamage).toBeCloseTo(plain.expectedDamage, 10)
  })

  it('会心率ちょうど 0 は補正なし', () => {
    expect(evaluate([['CM', 2]]).expectedDamage).toBe(200)
  })
})

describe('[AC6] 発動条件', () => {
  const skills: [string, number][] = [['COND', 2]]

  it('activeConditionIds が無い・空のときは条件の無い効果だけ数える', () => {
    expect(evaluate(skills).attack).toBe(200)
    expect(evaluate(skills, base, []).attack).toBe(200)
  })

  it('有効な条件を持つ効果だけを数える', () => {
    const onlyA = evaluate(skills, base, [A])
    expect(onlyA.attack).toBe(220)
    expect(onlyA.affinity).toBe(0)
    const onlyB = evaluate(skills, base, [B])
    expect(onlyB.attack).toBe(200)
    expect(onlyB.affinity).toBe(20)
    const both = evaluate(skills, base, [A, B])
    expect(both.attack).toBe(220)
    expect(both.affinity).toBe(20)
  })

  it('マスターに無い条件 ID は一致しないだけで例外を投げない', () => {
    expect(evaluate(skills, base, [conditionId('cd:nope')]).attack).toBe(200)
  })
})
