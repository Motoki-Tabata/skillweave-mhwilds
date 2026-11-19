import highsLoader, { type Highs } from 'highs'
import type { MasterBundle } from '@swv/data'
import { beforeAll, describe, expect, it } from 'vitest'
import { ELEMENT_TYPES } from '../main/damage'
import { InvalidRequestError } from '../main/errors'
import type { SolverRequest, SolverResponse } from '../main/request'
import { DAMAGE_EPSILON, solveBuilds } from '../main/solveBuilds'
import {
  armor,
  BASE_WEAPON_ID,
  buildMaster,
  charm,
  conditionId,
  decoration,
  makeRequest,
  masterSkill,
  plainArmors,
  skill,
  slot,
  uuid,
  weapon,
  weaponId,
} from './support/builders'
import { bruteForce, buildKey, freeLevels, type BruteConfig } from './support/bruteForce'
import { fakeClock, solve, solveVerified } from './support/harness'
import { loadRealMaster } from './support/realMaster'
import { verifyBuild } from './support/verifyBuild'

let highs: Highs

beforeAll(async () => {
  highs = await highsLoader()
})

const C1 = conditionId('cd:c1')
const ALL = [C1]
const EPS = DAMAGE_EPSILON

/**
 * 属性の最大化の手作りのマスター。どの部位の候補も互いに支配し合わない形にしてある
 * （支配される候補の除外で 2 件目以降が総当たりと変わらないように。.claude/rules/solver.md）。
 * 雷の武器には EADD・EMUL・AFF が効き、FIRE は効かない。火の武器ではその逆。
 * ECRIT は element を持たない（実マスターの形）ので、どちらの武器にも効く。
 */
function elementMaster(): MasterBundle {
  return buildMaster({
    skills: [
      masterSkill('Q', 'armor', 2),
      // lv1 は element を省略（どの種類にも効く）。lv2・3 は雷だけ
      masterSkill('EADD', 'armor', 3, [
        [{ stat: 'element_add', value: 2 }],
        [{ stat: 'element_add', value: 5, element: 'thunder' }],
        [{ stat: 'element_add', value: 9, element: 'thunder' }],
      ]),
      masterSkill('FIRE', 'armor', 2, [
        [{ stat: 'element_add', value: 8, element: 'fire' }],
        [{ stat: 'element_add', value: 16, element: 'fire' }],
      ]),
      masterSkill('EMUL', 'weapon', 2, [
        [{ stat: 'element_mul', value: 1.1, element: 'thunder' }],
        [{ stat: 'element_mul', value: 1.25, element: 'thunder' }],
      ]),
      masterSkill('ECRIT', 'armor', 3, [
        [{ stat: 'element_crit_mul', value: 1.2 }],
        [{ conditionId: C1, stat: 'element_crit_mul', value: 1.5 }],
        [{ stat: 'element_crit_mul', value: 1.4 }],
      ]),
      masterSkill('AFF', 'armor', 3, [
        [{ stat: 'affinity_add', value: 15 }],
        [{ stat: 'affinity_add', value: 30 }],
        [{ stat: 'affinity_add', value: 45 }],
      ]),
      masterSkill('WT', 'armor', 1, [[{ stat: 'element_add', value: 7, weaponTypes: ['sword'] }]]),
    ],
    conditions: [{ id: C1 }],
    weapons: [
      weapon(BASE_WEAPON_ID, {
        attack: 100,
        affinity: 10,
        slots: [slot(2, 'weapon')],
        element: { type: 'thunder', value: 30 },
      }),
      weapon('w-neg', {
        affinity: -40,
        slots: [slot(1, 'weapon')],
        element: { type: 'thunder', value: 30 },
      }),
      weapon('w-fire', {
        affinity: 10,
        slots: [slot(1, 'weapon')],
        element: { type: 'fire', value: 20 },
      }),
      weapon('w-sword', {
        weaponType: 'sword',
        affinity: 10,
        slots: [slot(1, 'weapon')],
        element: { type: 'thunder', value: 30 },
      }),
    ],
    armors: plainArmors({
      head: [
        armor('h1', 'head', { skills: [skill('Q'), skill('EADD')] }),
        armor('h2', 'head', { skills: [skill('ECRIT')], slots: [slot(2)] }),
      ],
      chest: [
        armor('c1', 'chest', { skills: [skill('AFF')], slots: [slot(1)] }),
        armor('c2', 'chest', { skills: [skill('Q'), skill('EADD')] }),
      ],
      arms: [
        armor('a1', 'arms', { slots: [slot(2)] }),
        armor('a2', 'arms', { skills: [skill('FIRE')], slots: [slot(1), slot(1)] }),
      ],
      waist: [
        armor('w1', 'waist', { skills: [skill('Q')], slots: [slot(2)] }),
        armor('w2', 'waist', { skills: [skill('AFF')], slots: [slot(3)] }),
      ],
      legs: [
        armor('l1', 'legs', { skills: [skill('EADD')], slots: [slot(1)] }),
        armor('l2', 'legs', { skills: [skill('WT')], slots: [slot(2)] }),
      ],
    }),
    decorations: [
      decoration('dQ', 'armor', 1, [skill('Q')]),
      decoration('dE', 'armor', 1, [skill('EADD')]),
      decoration('dA', 'armor', 1, [skill('AFF')]),
      decoration('dC', 'armor', 2, [skill('ECRIT')]),
      decoration('dM', 'weapon', 2, [skill('EMUL')]),
    ],
  })
}

const CHARMS = [
  charm('cm-a', { slots: [slot(1)] }),
  charm('cm-b', { skills: [skill('AFF')], slots: [] }),
]

const customWeapon = (affinity: number): SolverRequest['weapon'] => ({
  kind: 'custom',
  id: uuid('custom'),
  baseWeaponId: weaponId(BASE_WEAPON_ID),
  attack: 150,
  affinity,
  element: { type: 'thunder', value: 25 },
  slots: [slot(1, 'weapon'), slot(2, 'weapon')],
  skills: [],
  setBonusIds: [],
})

const masterWeapon = (id: string): SolverRequest['weapon'] => ({
  kind: 'master',
  weaponId: weaponId(id),
})

interface Scenario {
  name: string
  overrides: Partial<SolverRequest>
}

const SCENARIOS: Scenario[] = [
  { name: '条件をすべて有効にする（雷の武器）', overrides: { activeConditionIds: ALL } },
  { name: '条件を有効にしない（会心倍率 Lv2 は無効）', overrides: {} },
  {
    name: '会心率が負の武器（−40。会心率が正になるまで会心は効かない）',
    overrides: { weapon: masterWeapon('w-neg'), activeConditionIds: ALL },
  },
  {
    name: '会心率が 100 を超える個体差のある武器（85。custom の属性を使う）',
    overrides: { weapon: customWeapon(85), activeConditionIds: ALL },
  },
  {
    name: '火の武器（雷の効果は数えず、FIRE と element 省略の効果だけ数える）',
    overrides: { weapon: masterWeapon('w-fire'), activeConditionIds: ALL },
  },
  {
    name: '火の武器で条件なし（条件つきの効果を数えない）',
    overrides: { weapon: masterWeapon('w-fire') },
  },
  {
    name: '武器種で絞った効果（WT は sword だけ）',
    overrides: { weapon: masterWeapon('w-sword'), activeConditionIds: ALL },
  },
]

function build(master: MasterBundle, overrides: Partial<SolverRequest>): SolverRequest {
  return makeRequest(master, {
    charms: CHARMS,
    required: [skill('Q')],
    objective: { kind: 'maximize', metric: 'expectedElement' },
    ...overrides,
  })
}

/**
 * 防具と護石の組ごとの、期待値の最大と、最大から ε 以内の構成。
 * 全構成を持ち続けないための要約（他の組の最大から ε 以内に入りうるのは、その組の最大から ε 以内の構成だけ）
 */
function summarize(all: BruteConfig[]): Map<string, { max: number; near: BruteConfig[] }> {
  const max = new Map<string, number>()
  for (const c of all) max.set(c.key, Math.max(max.get(c.key) ?? -Infinity, c.expected))
  const result = new Map<string, { max: number; near: BruteConfig[] }>()
  for (const [key, top] of max) result.set(key, { max: top, near: [] })
  for (const c of all) {
    const entry = result.get(c.key)
    if (entry !== undefined && c.expected >= entry.max - EPS) entry.near.push(c)
  }
  return result
}

/** 同点（ε 以内）の中で、防具用、次に武器用の空き Lv が最大の組 */
function bestFree(ties: BruteConfig[]): { armor: number; weapon: number } {
  return ties.reduce(
    (best, c) =>
      c.armorFree > best.armor || (c.armorFree === best.armor && c.weaponFree > best.weapon)
        ? { armor: c.armorFree, weapon: c.weaponFree }
        : best,
    { armor: -1, weapon: -1 },
  )
}

describe.each(SCENARIOS)('[AC-7][AC-11] 総当たりとの一致: $name', ({ overrides }) => {
  const master = elementMaster()
  const request = build(master, overrides)
  const byKey = summarize(bruteForce(master, request))
  let response: SolverResponse

  beforeAll(async () => {
    response = await solveVerified(highs, master, request)
  })

  it('構成の数は、必須スキルを満たす防具と護石の組の数（上限 maxResults）に等しい', () => {
    expect(byKey.size).toBeGreaterThan(0)
    expect(response.status).toBe('optimal')
    expect(response.builds).toHaveLength(Math.min(byKey.size, request.maxResults))
  })

  it('i 件目の score は、それまでに返した組を除いた総当たりの最大に一致し、同点なら空き Lv の順になる', () => {
    const used = new Set<string>()
    for (const b of response.builds) {
      const remaining = [...byKey].filter(([key]) => !used.has(key))
      const best = remaining.reduce((m, [, s]) => Math.max(m, s.max), -Infinity)
      expect(Math.abs((b.score ?? Number.NaN) - best)).toBeLessThanOrEqual(EPS)
      const ties = remaining.flatMap(([, s]) => s.near.filter((c) => c.expected >= best - EPS))
      expect(freeLevels(master, request, b)).toEqual(bestFree(ties))
      expect(ties.some((c) => c.key === buildKey(b))).toBe(true)
      used.add(buildKey(b))
    }
  })

  it('score は降順（ε の許容）で、独立の検算（verifyBuild）に通る', () => {
    const scores = response.builds.map((b) => b.score ?? Number.NaN)
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i] ?? 0).toBeLessThanOrEqual((scores[i - 1] ?? 0) + EPS)
    }
    for (const b of response.builds) expect(verifyBuild(master, request, b)).toEqual([])
  })
})

describe('[AC-7] 発動条件のオンとオフで結果が変わる', () => {
  const master = elementMaster()

  it('会心倍率 Lv2 は条件がオンのときだけ数えるので、1 件目の score が変わる', async () => {
    const on = await solveVerified(
      highs,
      master,
      build(master, { activeConditionIds: ALL, maxResults: 1 }),
    )
    const off = await solveVerified(highs, master, build(master, { maxResults: 1 }))
    expect(on.builds[0]?.score ?? 0).toBeGreaterThan(off.builds[0]?.score ?? 0)
  })
})

describe('[AC-7] 同点の順（Q36）', () => {
  it('属性期待値が同じなら、防具用、次に武器用の空きスロット Lv の合計が大きい構成から返す', async () => {
    // 属性に効くスキルが無いので、属性期待値はどの構成も同じ（30）
    const master = buildMaster({
      skills: [masterSkill('Q', 'armor', 2)],
      weapons: [
        weapon(BASE_WEAPON_ID, {
          slots: [slot(1, 'weapon')],
          element: { type: 'thunder', value: 30 },
        }),
      ],
      armors: plainArmors({
        // 空き Lv の合計は h-two 4・h-big 3（スロットの形は支配し合わない）
        head: [
          armor('h-big', 'head', { slots: [slot(3)] }),
          armor('h-two', 'head', { slots: [slot(2), slot(2)] }),
        ],
      }),
    })
    const request = makeRequest(master, {
      objective: { kind: 'maximize', metric: 'expectedElement' },
    })
    const result = await solveVerified(highs, master, request)
    expect(result.builds.map((b) => b.armor.head)).toEqual(['h-two', 'h-big'])
    expect(result.builds.map((b) => b.score)).toEqual([30, 30])
  })
})

describe('[AC-8] 属性の最大化の要求の検証', () => {
  const master = buildMaster({
    skills: [masterSkill('Q', 'armor', 2)],
    weapons: [
      weapon(BASE_WEAPON_ID),
      weapon('w-poison', { element: { type: 'poison', value: 30 } }),
      weapon('w-mystery', { element: { type: 'mystery', value: 30 } }),
      weapon('w-thunder', { element: { type: 'thunder', value: 30 } }),
    ],
  })
  const objective = { kind: 'maximize', metric: 'expectedElement' } as const
  const custom = (over: Record<string, unknown>): SolverRequest['weapon'] =>
    ({ ...customWeapon(0), ...over }) as SolverRequest['weapon']

  const invalid: [string, SolverRequest['weapon']][] = [
    ['無属性のマスターの武器', masterWeapon(BASE_WEAPON_ID)],
    ['状態異常のマスターの武器', masterWeapon('w-poison')],
    ['種類が分からないマスターの武器', masterWeapon('w-mystery')],
    ['属性の無い個体差のある武器', custom({ element: undefined })],
    ['状態異常の個体差のある武器', custom({ element: { type: 'sleep', value: 10 } })],
    ['種類が分からない個体差のある武器', custom({ element: { type: 'mystery', value: 10 } })],
    ['属性値が 0 の個体差のある武器', custom({ element: { type: 'thunder', value: 0 } })],
    ['属性値が有限でない個体差のある武器', custom({ element: { type: 'thunder', value: NaN } })],
    ['会心率が整数でない個体差のある武器', custom({ affinity: 1.5 })],
    ['攻撃力が 0 以下の個体差のある武器', custom({ attack: 0 })],
  ]

  it.each(invalid)('%s は InvalidRequestError', async (_name, weaponArg) => {
    const request = makeRequest(master, { weapon: weaponArg, objective })
    await expect(solve(highs, master, request)).rejects.toBeInstanceOf(InvalidRequestError)
  })

  it('5 属性の武器（マスター・個体差のある武器）は通る', async () => {
    for (const w of [masterWeapon('w-thunder'), customWeapon(0)]) {
      const result = await solve(highs, master, makeRequest(master, { weapon: w, objective }))
      expect(result.status).toBe('optimal')
    }
  })

  it('同じ武器でも、属性の最大化でなければエラーにならない（無属性でも解ける）', async () => {
    const request = makeRequest(master, {
      weapon: masterWeapon(BASE_WEAPON_ID),
      objective: { kind: 'maximize', metric: 'expectedDamage' },
    })
    expect((await solve(highs, master, request)).status).toBe('optimal')
  })
})

describe('[AC-10] 既存の目的関数は属性を足さない', () => {
  it('expectedDamage の結果は、武器の属性・属性の効果があっても、無いときと同じ', async () => {
    const withElement = elementMaster()
    const stripped: MasterBundle = {
      ...withElement,
      weapons: withElement.weapons.map(({ element: _element, ...rest }) => rest),
      skills: withElement.skills.map((s) => ({
        ...s,
        effectsByLevel: s.effectsByLevel.map((effects) =>
          effects.filter((e) => !e.stat.startsWith('element_')),
        ),
      })),
    }
    const req = (m: MasterBundle) =>
      makeRequest(m, {
        charms: CHARMS,
        required: [skill('Q')],
        activeConditionIds: ALL,
        objective: { kind: 'maximize', metric: 'expectedDamage' },
        maxResults: 5,
      })
    const a = await solve(highs, withElement, req(withElement))
    const b = await solve(highs, stripped, req(stripped))
    expect(a.status).toBe(b.status)
    expect(a.builds).toEqual(b.builds)
  })
})

describe('[AC-11] 実データで属性の最大化を解く', () => {
  it('マスターの並びで先頭の 5 属性の武器で、全構成が検算に通り score が降順に並ぶ', async () => {
    const master = loadRealMaster()
    const found = master.weapons.find(
      (w) =>
        w.element !== undefined && (ELEMENT_TYPES as readonly string[]).includes(w.element.type),
    )
    if (found === undefined) throw new Error('5 属性の武器がマスターに無い')
    const request = makeRequest(master, {
      weapon: { kind: 'master', weaponId: found.id },
      required: [skill('sk:-1689391744', 3)],
      activeConditionIds: master.conditions.map((c) => c.id),
      objective: { kind: 'maximize', metric: 'expectedElement' },
      maxResults: 3,
      timeoutMs: 30_000,
    })
    const result = await solveBuilds(highs, master, request, fakeClock().options)
    expect(result.status).toBe('optimal')
    expect(result.builds.length).toBeGreaterThan(0)
    for (const b of result.builds) expect(verifyBuild(master, request, b)).toEqual([])
    const scores = result.builds.map((b) => b.score ?? Number.NaN)
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i] ?? 0).toBeLessThanOrEqual((scores[i - 1] ?? 0) + EPS)
    }
  }, 60_000)
})
