import highsLoader, { type Highs } from 'highs'
import type { MasterBundle } from '@swv/data'
import { beforeAll, describe, expect, it } from 'vitest'
import { evaluateDamage } from '../main/damage'
import type { SolverRequest } from '../main/request'
import { DAMAGE_EPSILON } from '../main/solveBuilds'
import {
  armor,
  buildMaster,
  makeRequest,
  masterSkill,
  plainArmors,
  skill,
  uuid,
  weapon,
  weaponId,
} from './support/builders'
import { bruteForce } from './support/bruteForce'
import { solveVerified } from './support/harness'

let highs: Highs

beforeAll(async () => {
  highs = await highsLoader()
})

const master: MasterBundle = buildMaster({
  skills: [
    masterSkill('BOW', 'armor', 1, [[{ stat: 'attack_add', value: 30, weaponTypes: ['bow'] }]]),
    masterSkill('SWORD', 'armor', 1, [
      [{ stat: 'attack_add', value: 20, weaponTypes: ['sword', 'lance'] }],
    ]),
    masterSkill('UNIV', 'armor', 1, [[{ stat: 'attack_add', value: 5 }]]),
    // 火力に数えない種類（AC-8）。武器種を持っていても結果を変えない
    masterSkill('ELEM', 'armor', 1, [
      [
        { stat: 'element_add', value: 5, weaponTypes: ['bow'] },
        { stat: 'status_add', value: 5 },
        { stat: 'element_crit_mul', value: 1.5, weaponTypes: ['bow'] },
      ],
    ]),
  ],
  armors: plainArmors({
    head: [
      armor('hB', 'head', { skills: [skill('BOW')] }),
      armor('hS', 'head', { skills: [skill('SWORD')] }),
      armor('hU', 'head', { skills: [skill('UNIV')] }),
      armor('hE', 'head', { skills: [skill('ELEM')] }),
    ],
  }),
  weapons: [
    weapon('w-bow', { weaponType: 'bow', attack: 100 }),
    weapon('w-sword', { weaponType: 'sword', attack: 100 }),
    weapon('w-hammer', { weaponType: 'hammer', attack: 100 }),
  ],
})

const base = { attack: 100, affinity: 0 }
const damageOf = (skills: string[], weaponType?: string) =>
  evaluateDamage(
    master,
    weaponType === undefined ? base : { ...base, weaponType },
    skills.map((s) => skill(s)),
  ).attack

describe('[AC6][AC7][AC8] evaluateDamage の武器種の絞り込み', () => {
  it('[AC6] weaponTypes を含む武器種のときだけ数える', () => {
    expect(damageOf(['BOW'], 'bow')).toBe(130)
    expect(damageOf(['BOW'], 'sword')).toBe(100)
    expect(damageOf(['SWORD'], 'lance')).toBe(120)
    expect(damageOf(['SWORD'], 'bow')).toBe(100)
  })

  it('[AC6] weaponTypes を持たない効果は武器種によらず数える', () => {
    expect(damageOf(['UNIV'], 'bow')).toBe(105)
    expect(damageOf(['UNIV'], 'hammer')).toBe(105)
    expect(damageOf(['UNIV'])).toBe(105)
  })

  it('[AC7] 武器種が分からない（省略）ときは weaponTypes を持つ効果を数えない', () => {
    expect(damageOf(['BOW', 'SWORD'])).toBe(100)
    expect(damageOf(['BOW', 'SWORD', 'UNIV'])).toBe(105)
  })

  it('[AC8] 属性値・状態異常値・属性の会心倍率の効果は火力を変えない', () => {
    const full = evaluateDamage(master, { ...base, weaponType: 'bow' }, [skill('ELEM')])
    expect(full).toEqual(evaluateDamage(master, base, []))
  })
})

describe('[AC6][AC7] solveBuilds（expectedDamage）の武器種の絞り込み', () => {
  const custom = (baseId: string): SolverRequest['weapon'] => ({
    kind: 'custom',
    id: uuid('c'),
    baseWeaponId: weaponId(baseId),
    attack: 100,
    affinity: 0,
    slots: [],
    skills: [],
    setBonusIds: [],
  })

  const cases: { name: string; weapon: SolverRequest['weapon']; head: string; score: number }[] = [
    {
      name: 'bow の武器は BOW の防具を選ぶ',
      weapon: { kind: 'master', weaponId: weaponId('w-bow') },
      head: 'hB',
      score: 130,
    },
    {
      name: 'sword の武器は SWORD の防具を選ぶ',
      weapon: { kind: 'master', weaponId: weaponId('w-sword') },
      head: 'hS',
      score: 120,
    },
    {
      name: 'hammer の武器はどちらも数えず UNIV の防具を選ぶ',
      weapon: { kind: 'master', weaponId: weaponId('w-hammer') },
      head: 'hU',
      score: 105,
    },
    {
      name: '基が sword の個体差のある武器は SWORD を選ぶ',
      weapon: custom('w-sword'),
      head: 'hS',
      score: 120,
    },
    {
      name: '基が bow の個体差のある武器は BOW を選ぶ',
      weapon: custom('w-bow'),
      head: 'hB',
      score: 130,
    },
  ]

  it.each(cases)('$name', async ({ weapon: w, head, score }) => {
    const request = makeRequest(master, {
      weapon: w,
      objective: { kind: 'maximize', metric: 'expectedDamage' },
    })
    const response = await solveVerified(highs, master, request)
    const first = response.builds[0]
    expect(first?.armor.head).toBe(head)
    expect(first?.score).toBeCloseTo(score, 6)
    // 候補の削減の後でも、総当たり（武器種に合った効果だけを数える参照）の最大と一致する
    const best = Math.max(...bruteForce(master, request).map((c) => c.expected))
    expect(Math.abs((first?.score ?? Number.NaN) - best)).toBeLessThanOrEqual(DAMAGE_EPSILON)
  })
})
