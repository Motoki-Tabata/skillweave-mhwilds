import highsLoader, { type Highs } from 'highs'
import type { MasterBundle } from '@swv/data'
import { beforeAll, describe, expect, it } from 'vitest'
import { SolveCancelledError } from '../main/errors'
import type { SolvedBuild, SolverRequest, SolverResponse } from '../main/request'
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
  setBonus,
  skill,
  slot,
  uuid,
  weapon,
  weaponId,
} from './support/builders'
import { bruteForce, buildKey, freeLevels, type BruteConfig } from './support/bruteForce'
import { fakeClock, solve, solveVerified } from './support/harness'
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
    // 条件なしの attack_mul（条件ありの MUL と連鎖する）
    masterSkill(
      'MUL2',
      'armor',
      2,
      eff([[{ stat: 'attack_mul', value: 1.03 }], [{ stat: 'attack_mul', value: 1.06 }]]) as never,
    ),
    // CM と異なる倍率の候補を持つ会心倍率（候補 g を共有する）
    masterSkill(
      'CM2',
      'weapon',
      2,
      eff([
        [{ conditionId: C1, stat: 'crit_mul', value: 1.3 }],
        [{ conditionId: C1, stat: 'crit_mul', value: 1.5 }],
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
      weapon('w-set', { attack: 90, slots: [slot(1, 'weapon')], setBonusIds: [SET_ID] }),
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
      decoration('dMUL2', 'armor', 2, [skill('MUL2')]),
      decoration('dCM2', 'weapon', 1, [skill('CM2')]),
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
    name: 'シリーズスキルを持つ武器（w-set。武器の1部位分が段に数えられる）',
    overrides: (m) => ({
      weapon: { kind: 'master', weaponId: m.weapons[2]?.id ?? weaponId('') },
      activeConditionIds: ALL,
    }),
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
        // 条件付き（MUL・CM・CM2）は無効。条件なしの MUL2 は有効なので付けてよい
        expect(/^d(MUL|CM|CM2)$/.test(d.decorationId)).toBe(false)
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
        // スロットの形が支配し合わない（024 D4 で除外されない）。空き Lv の合計は h-two 4・h-big 3
        head: [
          armor('h-big', 'head', { slots: [slot(3)] }),
          armor('h-two', 'head', { slots: [slot(2), slot(2)] }),
        ],
      }),
    })
    const request = makeRequest(master, {
      objective: { kind: 'maximize', metric: 'expectedDamage' },
    })
    const result = await solveVerified(highs, master, request)
    expect(result.builds.map((b) => b.armor.head)).toEqual(['h-two', 'h-big'])
    expect(result.builds.map((b) => b.score)).toEqual([100, 100])
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

describe('[019 AC5] 解なしの扱い（1回の求解で 1 件を決める方式）', () => {
  /** n 回目以降の Model.run を解なしの結果に差し替える（それ以外は本物のまま） */
  function infeasibleFrom(n: number): Highs {
    let runs = 0
    const wrapModel = (model: object) =>
      new Proxy(model, {
        get(m, prop) {
          const value: unknown = Reflect.get(m, prop, m)
          if (prop === 'run' && typeof value === 'function') {
            return (...args: unknown[]) => {
              runs++
              if (runs >= n) return { modelStatus: highs.constants.modelStatus.infeasible }
              return value.apply(m, args)
            }
          }
          return typeof value === 'function' ? value.bind(m) : value
        },
      })
    return new Proxy(highs, {
      get(target, prop) {
        const value: unknown = Reflect.get(target, prop, target)
        if (prop === 'withModel' && typeof value === 'function') {
          return (callback: (model: object) => unknown) =>
            value.call(target, (model: object) => callback(wrapModel(model)))
        }
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  }

  it('最初の求解が解なしでも例外にせず、状態 infeasible で空の構成を返す', async () => {
    const master = smallMaster()
    const request = build(master, { activeConditionIds: ALL })
    const result = await solve(infeasibleFrom(1), master, request)
    expect(result).toMatchObject({ status: 'infeasible', builds: [] })
  })

  it('2 件目の求解が解なしでも例外にせず、1 件目の構成をその件として返す', async () => {
    const master = smallMaster()
    const request = build(master, { activeConditionIds: ALL, maxResults: 5 })
    const real = await solveVerified(highs, master, { ...request, maxResults: 1 })
    const result = await solve(infeasibleFrom(2), master, request)
    expect(result.status).toBe('optimal')
    expect(result.builds).toEqual(real.builds)
  })
})

describe('[019 AC6][AC9] 期待値の時間切れ・キャンセル・進捗', () => {
  const master = smallMaster()
  const request = build(master, { activeConditionIds: ALL, maxResults: 5 })

  it('時間の上限を過ぎたら、それまでの構成を状態 timeout で返す', async () => {
    const clock = fakeClock(10_000) // 求解の前に 10 秒進む。3 回目の前に打ち切る（HiGHS の実時間の上限は残り 15 秒以上）
    const result = await solveBuilds(
      highs,
      master,
      { ...request, timeoutMs: 25_000 },
      clock.options,
    )
    expect(result.status).toBe('timeout')
    expect(result.builds).toHaveLength(2)
    for (const b of result.builds) expect(verifyBuild(master, request, b)).toEqual([])
  })

  it('キャンセルされたら SolveCancelledError を投げる', async () => {
    const clock = fakeClock(0, { isCancelled: () => true })
    await expect(solveBuilds(highs, master, request, clock.options)).rejects.toBeInstanceOf(
      SolveCancelledError,
    )
  })

  it('onProgress は件数と構成を渡し、構成は返す builds と同じ並びになる', async () => {
    const progress: { found: number; build: SolvedBuild }[] = []
    const clock = fakeClock(0, { onProgress: (found, build) => progress.push({ found, build }) })
    const result = await solveBuilds(highs, master, request, clock.options)
    expect(result.builds.length).toBeGreaterThan(1)
    expect(progress.map((p) => p.found)).toEqual(result.builds.map((_, i) => i + 1))
    expect(progress.map((p) => p.build)).toEqual(result.builds)
  })
})
