import highsLoader, { type Highs } from 'highs'
import type { ConditionId, MasterBundle } from '@swv/data'
import { beforeAll, describe, expect, it } from 'vitest'
import type { SolverRequest, SolverResponse } from '../main/request'
import { DAMAGE_EPSILON } from '../main/solveBuilds'
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
  setBonus,
  skill,
  slot,
  uuid,
  weapon,
  weaponId,
} from './support/builders'
import { bruteForce, buildKey, freeLevels, type BruteConfig } from './support/bruteForce'
import { solve, solveVerified } from './support/harness'
import { verifyBuild } from './support/verifyBuild'

let highs: Highs

beforeAll(async () => {
  highs = await highsLoader()
})

const C1 = conditionId('cd:c1')
const C2 = conditionId('cd:c2')
const ALL = [C1, C2]
const SET_ID = 'sb:SS'
const EPS = DAMAGE_EPSILON

/** 効果を持つスキルの組。CM は 1.4 → 1.3 とレベルに単調でない（2 個付けると下がる） */
function skills(withEffects: boolean) {
  const eff = <T>(effects: T): T | never[] => (withEffects ? effects : [])
  return [
    masterSkill('Q', 'armor', 2),
    masterSkill(
      'ATK',
      'armor',
      3,
      eff([
        [{ stat: 'attack_add', value: 4 }],
        [{ stat: 'attack_add', value: 9 }],
        [{ stat: 'attack_add', value: 15 }],
      ]) as never,
    ),
    masterSkill(
      'MUL',
      'weapon',
      2,
      eff([
        [{ conditionId: C1, stat: 'attack_mul', value: 1.04 }],
        [{ conditionId: C1, stat: 'attack_mul', value: 1.1 }],
      ]) as never,
    ),
    masterSkill(
      'AFF',
      'armor',
      3,
      eff([
        [{ stat: 'affinity_add', value: 8 }],
        [{ stat: 'affinity_add', value: 16 }],
        [{ stat: 'affinity_add', value: 25 }],
      ]) as never,
    ),
    masterSkill(
      'CM',
      'weapon',
      2,
      eff([
        [{ conditionId: C2, stat: 'crit_mul', value: 1.4 }],
        [{ conditionId: C2, stat: 'crit_mul', value: 1.3 }],
      ]) as never,
    ),
    masterSkill(
      'SS',
      'series',
      2,
      eff([
        [{ conditionId: C1, stat: 'attack_add', value: 10 }],
        [{ conditionId: C1, stat: 'attack_add', value: 30 }],
      ]) as never,
    ),
  ]
}

function smallMaster(withEffects = true): MasterBundle {
  return buildMaster({
    skills: skills(withEffects),
    setBonuses: [
      setBonus('SS', [
        { pieces: 2, level: 1 },
        { pieces: 4, level: 2 },
      ]),
    ],
    conditions: [{ id: C1 }, { id: C2 }],
    weapons: [
      weapon(BASE_WEAPON_ID, { attack: 100, affinity: 0, slots: [slot(2, 'weapon')] }),
      weapon('w-neg', { attack: 120, affinity: -30, slots: [slot(1, 'weapon')] }),
    ],
    armors: plainArmors({
      head: [
        armor('h1', 'head', { skills: [skill('Q')], slots: [slot(2)], setBonusIds: [SET_ID] }),
        armor('h2', 'head', {
          skills: [skill('ATK')],
          slots: [slot(1), slot(1)],
          setBonusIds: [SET_ID],
        }),
      ],
      chest: [
        armor('c1', 'chest', { slots: [slot(3)], setBonusIds: [SET_ID] }),
        armor('c2', 'chest', { skills: [skill('Q'), skill('AFF')], setBonusIds: [SET_ID] }),
      ],
      arms: [armor('a1', 'arms', { slots: [slot(1)], setBonusIds: [SET_ID] })],
      waist: [armor('w1', 'waist', { skills: [skill('ATK')], slots: [slot(2)] })],
    }),
    decorations: [
      decoration('dQ', 'armor', 1, [skill('Q')]),
      decoration('dATK', 'armor', 1, [skill('ATK')]),
      decoration('dATK2', 'armor', 3, [skill('ATK', 2)]),
      decoration('dAFF', 'armor', 2, [skill('AFF')]),
      decoration('dCM', 'weapon', 1, [skill('CM')]),
      decoration('dMUL', 'weapon', 2, [skill('MUL')]),
    ],
  })
}

const CHARMS = [
  charm('cm-a', { slots: [slot(1)] }),
  charm('cm-b', { skills: [skill('AFF')], slots: [] }),
]

interface Scenario {
  name: string
  overrides: (master: MasterBundle) => Partial<SolverRequest>
}

const customWeapon = (affinity: number): SolverRequest['weapon'] => ({
  kind: 'custom',
  id: uuid('custom'),
  baseWeaponId: weaponId(BASE_WEAPON_ID),
  attack: 150,
  affinity,
  slots: [slot(1, 'weapon'), slot(2, 'weapon')],
  skills: [],
  setBonusIds: [],
})

const SCENARIOS: Scenario[] = [
  { name: '条件をすべて有効にする', overrides: () => ({ activeConditionIds: ALL }) },
  { name: '条件を有効にしない（条件付きの効果は無効）', overrides: () => ({}) },
  {
    name: '条件 c1 だけ有効（attack_mul とシリーズの効果）',
    overrides: () => ({ activeConditionIds: [C1] }),
  },
  { name: '条件 c2 だけ有効（会心倍率）', overrides: () => ({ activeConditionIds: [C2] }) },
  {
    name: '負の会心率の武器（−30）',
    overrides: (m) => ({
      weapon: { kind: 'master', weaponId: m.weapons[1]?.id ?? weaponId('') },
      activeConditionIds: ALL,
    }),
  },
  {
    name: '会心率が 100 を超える個体差のある武器（85）',
    overrides: () => ({ weapon: customWeapon(85), activeConditionIds: ALL }),
  },
  {
    name: '会心率が −100 を下回る個体差のある武器（−115。装飾品で範囲内にも入る）',
    overrides: () => ({ weapon: customWeapon(-115), activeConditionIds: ALL }),
  },
  {
    name: '必須スキルの下限が高い（Q2）',
    overrides: () => ({ required: [skill('Q', 2)], activeConditionIds: ALL }),
  },
]

function build(master: MasterBundle, overrides: Partial<SolverRequest>): SolverRequest {
  return makeRequest(master, {
    charms: CHARMS,
    required: [skill('Q')],
    objective: { kind: 'maximize', metric: 'expectedDamage' },
    ...overrides,
  })
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

describe.each(SCENARIOS)('[AC8][AC9][AC11] 総当たりとの一致: $name', ({ overrides }) => {
  const master = smallMaster()
  const request = build(master, overrides(master))
  const all = bruteForce(master, request)
  let response: SolverResponse

  beforeAll(async () => {
    response = await solveVerified(highs, master, request)
  })

  it('構成の数は、必須スキルを満たす防具と護石の組の数に等しい（解なしではない）', () => {
    const keys = new Set(all.map((c) => c.key))
    expect(keys.size).toBeGreaterThan(0)
    expect(response.status).toBe('optimal')
    expect(response.builds).toHaveLength(keys.size)
  })

  it('i 件目の score は、それまでに返した組を除いた総当たりの最大に一致し、同点なら空き Lv の順になる', () => {
    const used = new Set<string>()
    for (const b of response.builds) {
      const remaining = all.filter((c) => !used.has(c.key))
      const best = Math.max(...remaining.map((c) => c.expected))
      expect(Math.abs((b.score ?? Number.NaN) - best)).toBeLessThanOrEqual(EPS)
      const ties = remaining.filter((c) => c.expected >= best - EPS)
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

describe('[AC9] 必須スキルに無いスキルの装飾品', () => {
  const master = smallMaster()

  it('期待値を上げる装飾品（ATK・AFF・CM・MUL）は付ける。寄与しない装飾品は付けない', async () => {
    const request = build(master, { activeConditionIds: ALL, maxResults: 1 })
    const result = await solveVerified(highs, master, request)
    const ids = new Set(result.builds[0]?.decorations.map((d) => d.decorationId))
    // 必須の Q は防具で満たせる。余った枠は火力スキルの装飾品で埋める
    expect([...ids].some((id) => /^d(ATK|AFF|CM|MUL)/.test(id))).toBe(true)
  })

  it('期待値に寄与しない状況（効果が無効）では、必須スキルに必要な装飾品だけを付ける', async () => {
    // 条件を有効にしないと ATK・AFF 以外の効果は無効だが、ATK・AFF は常時有効なので c1/c2 の効果だけ止まる
    const request = build(master, { required: [skill('Q', 2)], maxResults: 30 })
    const result = await solveVerified(highs, master, request)
    for (const b of result.builds) {
      for (const d of b.decorations) {
        expect(/^d(MUL|CM)/.test(d.decorationId)).toBe(false)
      }
    }
  })
})

describe('[AC9][AC11] 同点の順（Q36）', () => {
  it('期待値が同じなら、防具用、次に武器用の空きスロット Lv の合計が大きい構成から返す', async () => {
    // 火力に効くスキルが無いので、期待値はどの構成も同じ（攻撃力 100）
    const master = buildMaster({
      skills: [masterSkill('Q', 'armor', 2)],
      weapons: [weapon(BASE_WEAPON_ID, { slots: [slot(1, 'weapon')] })],
      armors: plainArmors({
        head: [
          armor('h-small', 'head', { slots: [slot(1)] }),
          armor('h-big', 'head', { slots: [slot(3)] }),
          armor('h-q', 'head', { skills: [skill('Q')], slots: [slot(4)] }),
        ],
      }),
    })
    const request = makeRequest(master, {
      objective: { kind: 'maximize', metric: 'expectedDamage' },
    })
    const result = await solveVerified(highs, master, request)
    expect(result.builds.map((b) => b.armor.head)).toEqual(['h-q', 'h-big', 'h-small'])
    expect(result.builds.map((b) => b.score)).toEqual([100, 100, 100])
  })
})

describe('[AC10] 他の目的関数の結果は effectsByLevel の有無で変わらない', () => {
  const withEffects = smallMaster(true)
  const withoutEffects = smallMaster(false)
  const metrics = [
    { kind: 'feasible' },
    { kind: 'maximize', metric: 'defense' },
    { kind: 'maximize', metric: 'freeSlots' },
  ] as const

  it.each(metrics)('目的関数 %j の構成と状態が一致する', async (objective) => {
    const req = (m: MasterBundle) =>
      makeRequest(m, {
        charms: CHARMS,
        required: [skill('Q')],
        objective,
        activeConditionIds: ALL,
      })
    const a = await solve(highs, withEffects, req(withEffects))
    const b = await solve(highs, withoutEffects, req(withoutEffects))
    expect(a.status).toBe(b.status)
    expect(a.builds).toEqual(b.builds)
    expect(a.builds.length).toBeGreaterThan(0)
  })
})

describe('[AC8] 期待値の ILP の端の条件', () => {
  it('必須スキルに届かなければ解なし', async () => {
    const master = smallMaster()
    const request = build(master, {
      required: [skill('SS', 2)], // 4 部位が要るが、頭と胴を外すと 3 部位までしか届かない
      fixedArmor: { head: null, chest: null },
    })
    const result = await solve(highs, master, request)
    expect(result).toMatchObject({ status: 'infeasible', builds: [] })
  })

  it('maxResults で件数を打ち切り、返した組は重ならない', async () => {
    const master = smallMaster()
    const request = build(master, { activeConditionIds: ALL, maxResults: 3 })
    const result = await solveVerified(highs, master, request)
    expect(result.builds).toHaveLength(3)
  })

  it('護石なし・全部位固定なし（変数が少ない）でも解ける', async () => {
    const master = smallMaster()
    const request = build(master, { charms: [], activeConditionIds: ALL })
    const result = await solveVerified(highs, master, request)
    expect(result.status).toBe('optimal')
  })

  it('効果を持つスキルが無い（対象のスキルが空）マスターでも、攻撃力そのものが score になる', async () => {
    const master = buildMaster({ skills: [masterSkill('Q')] })
    const result = await solveVerified(
      highs,
      master,
      makeRequest(master, { objective: { kind: 'maximize', metric: 'expectedDamage' } }),
    )
    expect(result.builds[0]?.score).toBe(100)
  })

  it('全部位を null 固定して護石も無いとき（変数が無い）も 1 件返す', async () => {
    const master = buildMaster({ skills: [masterSkill('Q')] })
    const result = await solve(
      highs,
      master,
      makeRequest(master, {
        fixedArmor: { head: null, chest: null, arms: null, waist: null, legs: null },
        objective: { kind: 'maximize', metric: 'expectedDamage' },
      }),
    )
    expect(result.builds).toHaveLength(1)
    expect(result.builds[0]?.score).toBe(100)
  })
})

export type { ConditionId }
