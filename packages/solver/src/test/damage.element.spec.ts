import { describe, expect, it } from 'vitest'
import { ELEMENT_TYPES, STATUS_TYPES, evaluateDamage, type DamageBase } from '../main/damage'
import { buildMaster, conditionId, masterSkill, skill } from './support/builders'

const A = conditionId('cd:a')

const master = buildMaster({
  skills: [
    // lv1: element 省略（どの種類の武器にも効く）、lv2: 雷だけ、lv3: 火だけ
    masterSkill('EADD', 'armor', 3, [
      [{ stat: 'element_add', value: 2 }],
      [{ stat: 'element_add', value: 4, element: 'thunder' }],
      [{ stat: 'element_add', value: 6, element: 'fire' }],
    ]),
    masterSkill('EMUL', 'armor', 2, [
      [{ stat: 'element_mul', value: 1.1, element: 'thunder' }],
      [{ stat: 'element_mul', value: 1.2, element: 'fire' }],
    ]),
    masterSkill('EADDC', 'armor', 1, [[{ conditionId: A, stat: 'element_add', value: 5 }]]),
    masterSkill('ECRIT', 'armor', 3, [
      [{ stat: 'element_crit_mul', value: 1.2 }],
      [{ conditionId: A, stat: 'element_crit_mul', value: 1.3 }],
      [{ stat: 'element_crit_mul', value: 1.4, weaponTypes: ['sword'] }],
    ]),
    masterSkill('ECRIT2', 'armor', 1, [[{ stat: 'element_crit_mul', value: 1.35 }]]),
    masterSkill('AFF', 'armor', 3, [
      [{ stat: 'affinity_add', value: 20 }],
      [{ stat: 'affinity_add', value: 50 }],
      [{ stat: 'affinity_add', value: 60 }],
    ]),
    masterSkill('SADD', 'armor', 3, [
      [{ stat: 'status_add', value: 5 }],
      [{ stat: 'status_add', value: 10, element: 'poison' }],
      [{ stat: 'status_mul', value: 1.5, element: 'sleep' }],
    ]),
    masterSkill('ATK', 'armor', 1, [[{ stat: 'attack_add', value: 10 }]]),
  ],
  conditions: [{ id: A }],
})

const thunder = { type: 'thunder', value: 10 }
const evaluate = (
  skills: [string, number][],
  base: Partial<DamageBase> = {},
  active?: Parameters<typeof evaluateDamage>[3],
) =>
  evaluateDamage(
    master,
    { attack: 200, affinity: 0, element: thunder, ...base },
    skills.map(([id, level]) => skill(id, level)),
    active,
  )

describe('[AC4] 属性が無い・分からない武器は属性を計算しない', () => {
  it('無属性の武器は element を持たない（プロパティごと無い）', () => {
    const r = evaluate([['EADD', 1]], { element: undefined })
    expect('element' in r).toBe(false)
    expect(r.attack).toBe(200)
  })

  it('属性の種類が 5 属性にも状態異常にも無い武器は element を持たない', () => {
    const r = evaluate([['EADD', 1]], { element: { type: 'mystery', value: 10 } })
    expect('element' in r).toBe(false)
  })

  it('種類の定数は 5 属性と状態異常 4 種', () => {
    expect([...ELEMENT_TYPES]).toEqual(['fire', 'water', 'thunder', 'ice', 'dragon'])
    expect([...STATUS_TYPES]).toEqual(['poison', 'paralysis', 'sleep', 'blastblight'])
  })
})

describe('[AC1] 属性値 = 武器の値 × element_mul の積 + element_add の和', () => {
  it('スキルなしは武器の値そのもの（上限は設けない）', () => {
    expect(evaluate([]).element).toEqual({
      kind: 'element',
      type: 'thunder',
      value: 10,
      critMultiplier: 1,
      expected: 10,
    })
  })

  it('element を省略した効果は種類を問わず数える', () => {
    expect(evaluate([['EADD', 1]]).element).toMatchObject({ value: 12 })
    expect(evaluate([['EADD', 1]], { element: { type: 'fire', value: 10 } }).element).toMatchObject(
      { value: 12 },
    )
  })

  it('種類が合う効果は数え、合わない効果（雷の武器に火）は数えない', () => {
    expect(evaluate([['EADD', 2]]).element).toMatchObject({ value: 14 })
    expect(evaluate([['EADD', 3]]).element).toMatchObject({ value: 10 })
    expect(evaluate([['EMUL', 2]]).element).toMatchObject({ value: 10 })
  })

  it('乗算してから加算する（順序は攻撃力と同じ）', () => {
    const r = evaluate([
      ['EMUL', 1],
      ['EADD', 1],
    ])
    expect(r.element).toMatchObject({ value: 10 * 1.1 + 2 })
  })

  it('発動条件がオフの効果は数えず、オンなら数える', () => {
    expect(evaluate([['EADDC', 1]]).element).toMatchObject({ value: 10 })
    expect(evaluate([['EADDC', 1]], {}, [A]).element).toMatchObject({ value: 15 })
  })

  it('status_* は 5 属性の武器では数えない', () => {
    expect(evaluate([['SADD', 1]]).element).toMatchObject({ value: 10 })
  })

  it('物理の値は属性の有無で変わらない', () => {
    const withElement = evaluate([['ATK', 1]])
    const without = evaluate([['ATK', 1]], { element: undefined })
    expect(withElement.attack).toBe(without.attack)
    expect(withElement.expectedDamage).toBe(without.expectedDamage)
  })
})

describe('[AC2] 属性期待値 = 属性値 × 属性の会心補正', () => {
  it('会心率が 0 のときは補正 1（会心倍率があっても）', () => {
    const r = evaluate([['ECRIT', 1]])
    expect(r.element).toMatchObject({ critMultiplier: 1.2, expected: 10 })
  })

  it('会心率が正のとき 1 + 会心率 ÷ 100 ×（倍率 − 1）', () => {
    const r = evaluate([['ECRIT', 1]], { affinity: 50 })
    expect(r.element).toMatchObject({ value: 10, expected: 10 * (1 + 0.5 * 0.2) })
  })

  it('会心倍率は有効な element_crit_mul の最大。無ければ 1', () => {
    const r = evaluate(
      [
        ['ECRIT', 1],
        ['ECRIT2', 1],
      ],
      { affinity: 100 },
    )
    expect(r.element).toMatchObject({ critMultiplier: 1.35, expected: 10 * 1.35 })
    const none = evaluate([], { affinity: 100 })
    expect(none.element).toMatchObject({ critMultiplier: 1, expected: 10 })
  })

  it('会心率が負のときは補正 1（属性を減らさない）', () => {
    const r = evaluate([['ECRIT', 1]], { affinity: -30 })
    expect(r.affinity).toBe(-30)
    expect(r.element).toMatchObject({ expected: 10 })
  })

  it('会心率が 100 を超えても 100 に丸めて計算する', () => {
    const r = evaluate([['AFF', 3]], { affinity: 90 })
    expect(r.affinity).toBe(100)
    const crit = evaluate(
      [
        ['AFF', 3],
        ['ECRIT', 1],
      ],
      { affinity: 90 },
    )
    expect(crit.element).toMatchObject({ expected: 10 * 1.2 })
  })

  it('会心率が −100 を下回っても補正は 1', () => {
    const r = evaluate([['ECRIT', 1]], { affinity: -150 })
    expect(r.affinity).toBe(-100)
    expect(r.element).toMatchObject({ expected: 10 })
  })

  it('発動条件がオフの会心倍率は数えない', () => {
    const off = evaluate([['ECRIT', 2]], { affinity: 50 })
    expect(off.element).toMatchObject({ critMultiplier: 1, expected: 10 })
    const on = evaluate([['ECRIT', 2]], { affinity: 50 }, [A])
    expect(on.element).toMatchObject({ critMultiplier: 1.3, expected: 10 * 1.15 })
  })

  it('weaponTypes で絞った効果は、武器種が合うときだけ数える', () => {
    const base = { affinity: 100 }
    expect(evaluate([['ECRIT', 3]], { ...base, weaponType: 'sword' }).element).toMatchObject({
      critMultiplier: 1.4,
    })
    expect(evaluate([['ECRIT', 3]], { ...base, weaponType: 'bow' }).element).toMatchObject({
      critMultiplier: 1,
    })
    expect(evaluate([['ECRIT', 3]], base).element).toMatchObject({ critMultiplier: 1 })
  })
})

describe('[AC3] 状態異常の武器は強化後の蓄積値を返す', () => {
  const poison = { type: 'poison', value: 30 }
  const sleep = { type: 'sleep', value: 30 }

  it('スキルなしは武器の値そのもので、期待値・会心は持たない', () => {
    expect(evaluate([], { element: poison, affinity: 100 }).element).toEqual({
      kind: 'status',
      type: 'poison',
      value: 30,
    })
  })

  it('status_add は種類が合う・省略のものを足し、合わないものは数えない', () => {
    expect(evaluate([['SADD', 1]], { element: poison }).element).toMatchObject({ value: 35 })
    expect(evaluate([['SADD', 2]], { element: poison }).element).toMatchObject({ value: 40 })
    expect(evaluate([['SADD', 2]], { element: sleep }).element).toMatchObject({ value: 30 })
  })

  it('status_mul は種類が合うときだけかける', () => {
    expect(evaluate([['SADD', 3]], { element: sleep }).element).toMatchObject({ value: 45 })
    expect(evaluate([['SADD', 3]], { element: poison }).element).toMatchObject({ value: 30 })
  })

  it('element_* は状態異常の武器では数えない', () => {
    const r = evaluate(
      [
        ['EADD', 1],
        ['ECRIT', 1],
      ],
      { element: poison },
    )
    expect(r.element).toEqual({ kind: 'status', type: 'poison', value: 30 })
  })
})
