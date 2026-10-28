/**
 * 測定ハーネス（機能 003・受入基準 14。`pnpm --filter @swv/solver run measure`）。
 * CI では実行しない。時間は検査（assert）せず、console に出力するだけ。
 * 一部のケースだけ走らせるときは `-t "k=3 解あり"` のように名前で絞る。
 */
import os from 'node:os'
import highsLoader, { type Highs, type Model } from 'highs'
import type { MasterBundle } from '@swv/data'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SolverResponse } from '../main/request'
import { solveBuilds } from '../main/solveBuilds'
import { makeRequest, skill } from './support/builders'
import { topRankCraftedCharms } from './support/craftedCharms'
import { loadRealMaster } from './support/realMaster'

const REPEATS = 3
const THRESHOLD_MS = 3000
const TIMEOUT_MS = 60_000
const MAX_RESULTS = 30
const DAMAGE_MAX_RESULTS = 10

/** 実データ（master-2026.10.1）から固定で選んだスキル。名前は 2026.10.1 の辞書 */
const SK = {
  fire: 'sk:-3666104', // 火竜の力（シリーズ。2 部位で Lv1・4 部位で Lv2）
  scale: 'sk:1487598336', // 鱗張りの技法（グループ。3 部位で Lv1）
  taijutsu: 'sk:-1689391744', // 体術
  evade: 'sk:144660544', // 回避性能
  challenger: 'sk:1865909632', // 挑戦者
  weak: 'sk:-397570464', // 弱点特効
  grudge: 'sk:1359821952', // 逆恨み
  fullcharge: 'sk:2106877312', // フルチャージ
  release: 'sk:1763191040', // 力の解放
  stamina: 'sk:-315492576', // スタミナ急速回復
}

type Pair = [skillId: string, level: number]

interface Case {
  label: string
  required: Pair[]
  expected: 'optimal' | 'infeasible'
  /** 目的関数。省略は 003 の defense（maxResults 30）。expectedDamage は条件をすべて有効にして maxResults 10（機能 006 D17） */
  metric?: 'expectedDamage'
  /** 021 D16: 系統ごとの最上位ランクの生産護石を候補にする。護石が増えると解なしが解ありになりうるので、状態の一致は検査しない */
  crafted?: boolean
}

// どのケースもシリーズ／グループスキル（火竜の力・鱗張りの技法）を含む。
// 解なしは、それぞれのスキルは単独で満たせるが、組み合わせては満たせない下限
// （火竜の力 Lv2 = 4 部位 と 回避性能 Lv5 と 挑戦者 Lv5 など）を選んだ。
const CASES: Case[] = [
  {
    label: 'k=3 解あり',
    required: [
      [SK.fire, 1],
      [SK.scale, 1],
      [SK.taijutsu, 3],
    ],
    expected: 'optimal',
  },
  {
    label: 'k=3 解なし',
    required: [
      [SK.fire, 2],
      [SK.evade, 5],
      [SK.challenger, 5],
    ],
    expected: 'infeasible',
  },
  {
    label: 'k=6 解あり',
    required: [
      [SK.fire, 1],
      [SK.scale, 1],
      [SK.taijutsu, 3],
      [SK.evade, 3],
      [SK.challenger, 3],
      [SK.weak, 3],
    ],
    expected: 'optimal',
  },
  {
    label: 'k=6 解なし',
    required: [
      [SK.fire, 2],
      [SK.taijutsu, 4],
      [SK.evade, 4],
      [SK.challenger, 4],
      [SK.weak, 4],
      [SK.grudge, 3],
    ],
    expected: 'infeasible',
  },
  {
    label: 'k=10 解あり',
    required: [
      [SK.fire, 1],
      [SK.scale, 1],
      [SK.taijutsu, 3],
      [SK.evade, 2],
      [SK.challenger, 2],
      [SK.weak, 2],
      [SK.grudge, 1],
      [SK.fullcharge, 1],
      [SK.release, 1],
      [SK.stamina, 1],
    ],
    expected: 'optimal',
  },
  {
    label: 'k=10 解なし',
    required: [
      [SK.fire, 1],
      [SK.scale, 1],
      [SK.taijutsu, 2],
      [SK.evade, 2],
      [SK.challenger, 2],
      [SK.weak, 2],
      [SK.grudge, 2],
      [SK.fullcharge, 2],
      [SK.release, 2],
      [SK.stamina, 1],
    ],
    expected: 'infeasible',
  },
]

/** 006 D17: 003 と同じ必須スキルの組を expectedDamage で解く。ラベルの接頭辞で 003 のケースと区別する（-t で絞るため） */
const DAMAGE_CASES: Case[] = CASES.map((c) => ({
  ...c,
  label: `expectedDamage ${c.label}`,
  metric: 'expectedDamage',
}))

/** 021 D16: 003 の defense と 006 の expectedDamage の各ケースの、生産護石あり版 */
const CRAFTED_CASES: Case[] = [...CASES, ...DAMAGE_CASES].map((c) => ({
  ...c,
  label: `生産護石あり ${c.label}`,
  crafted: true,
}))

interface Measurement {
  label: string
  metric: string
  crafted: boolean
  run: number
  totalMs: number
  /** 開始から最初の onProgress（1 件目の構成）までの時間。構成が 1 件も無いとき（解なし・時間切れ）は undefined */
  firstMs: number | undefined
  solveMs: number[]
  /** run() ごとの分枝限定のノード数（取れないときは 0） */
  nodes: number[]
  /** run() ごとの単体法の反復数（presolve で判定されたときは 0） */
  lpIterations: number[]
  builds: number
  status: SolverResponse['status']
}

interface SolveStats {
  solveMs: number[]
  nodes: number[]
  lpIterations: number[]
}

let highs: Highs
let master: MasterBundle
const measurements: Measurement[] = []

/** 求解後の info の値。取れないとき（求解前・アルゴリズムによる）は 0 */
function readInfo(model: Model, name: string): number {
  try {
    return Number(model.info.get(name))
  } catch {
    return 0
  }
}

/** withModel が渡すモデルの run() ごとに時間・ノード数・反復数を取る（src/main に計測用の引数を足さない） */
function instrument(target: Highs, stats: SolveStats): Highs {
  const timeRun = (model: object) =>
    new Proxy(model, {
      get(m, prop) {
        const value: unknown = Reflect.get(m, prop, m)
        if (prop === 'run' && typeof value === 'function') {
          return (...args: unknown[]) => {
            const start = performance.now()
            const result: unknown = value.apply(m, args)
            stats.solveMs.push(performance.now() - start)
            stats.nodes.push(readInfo(m as Model, 'mip_node_count'))
            stats.lpIterations.push(readInfo(m as Model, 'simplex_iteration_count'))
            return result
          }
        }
        return typeof value === 'function' ? value.bind(m) : value
      },
    })
  return new Proxy(target, {
    get(h, prop) {
      const value: unknown = Reflect.get(h, prop, h)
      if (prop === 'withModel' && typeof value === 'function') {
        return (operation: (model: object) => unknown) =>
          value.call(h, (model: object) => operation(timeRun(model)))
      }
      return typeof value === 'function' ? value.bind(h) : value
    },
  })
}

/** スキルを持たず、シリーズ／グループスキルも持たない、マスターの先頭の武器（固定） */
function plainWeaponId() {
  const found = master.weapons.find((w) => w.skills.length === 0 && w.setBonusIds.length === 0)
  if (found === undefined) throw new Error('スキルを持たないマスターの武器が無い')
  return found.id
}

async function measureCase(testCase: Case) {
  for (let run = 1; run <= REPEATS; run++) {
    const stats: SolveStats = { solveMs: [], nodes: [], lpIterations: [] }
    const isDamage = testCase.metric === 'expectedDamage'
    const request = makeRequest(master, {
      weapon: { kind: 'master', weaponId: plainWeaponId() },
      charms: testCase.crafted === true ? topRankCraftedCharms(master) : [],
      required: testCase.required.map(([id, level]) => skill(id, level)),
      objective: { kind: 'maximize', metric: isDamage ? 'expectedDamage' : 'defense' },
      ...(isDamage && { activeConditionIds: master.conditions.map((c) => c.id) }),
      maxResults: isDamage ? DAMAGE_MAX_RESULTS : MAX_RESULTS,
      timeoutMs: TIMEOUT_MS,
    })
    let firstMs: number | undefined
    const start = performance.now()
    const result = await solveBuilds(instrument(highs, stats), master, request, {
      now: () => performance.now(),
      yieldControl: () => new Promise<void>((resolve) => setImmediate(resolve)),
      onProgress: () => {
        firstMs ??= performance.now() - start
      },
    })
    const totalMs = performance.now() - start
    measurements.push({
      label: testCase.label,
      metric: isDamage ? 'expectedDamage' : 'defense',
      crafted: testCase.crafted === true,
      run,
      totalMs,
      firstMs,
      ...stats,
      builds: result.builds.length,
      status: result.status,
    })
    if (testCase.crafted === true) {
      // 生産護石ありは状態が変わりうる。時間切れでなく、答えが出たことだけを確かめる
      expect(['optimal', 'infeasible']).toContain(result.status)
      return
    }
    // 解ありは optimal で 1 件以上、解なしは infeasible を返したことを確かめる
    expect(result.status).toBe(testCase.expected)
    if (testCase.expected === 'optimal') expect(result.builds.length).toBeGreaterThan(0)
  }
}

const fmt = (ms: number) => ms.toFixed(1)

/**
 * 1 件目までの時間。構成が 1 件も無い回（解なし）は、結果が分かるまでの時間として合計時間を使う
 * （最大が過小にならないように）。
 */
const firstOrTotal = (m: Measurement) => m.firstMs ?? m.totalMs

const passFail = (ms: number) => (ms <= THRESHOLD_MS ? 'PASS' : 'FAIL')

/** 機能 019 D8: 合計時間の最大が基準以下なら合格。超えたときは 1 件目までの時間の最大が基準以下なら合格 */
function damageLines(crafted: boolean): string[] {
  const tag = crafted ? '生産護石あり ' : ''
  const damage = measurements.filter((m) => m.metric === 'expectedDamage' && m.crafted === crafted)
  if (damage.length === 0) return []
  const maxTotal = Math.max(...damage.map((m) => m.totalMs))
  const maxFirst = Math.max(...damage.map(firstOrTotal))
  const lines = [
    `max total ms over ${tag}expectedDamage cases and runs: ${fmt(maxTotal)} (threshold ${THRESHOLD_MS} ms): ${passFail(maxTotal)}`,
    `max first-build ms over ${tag}expectedDamage cases and runs: ${fmt(maxFirst)} (threshold ${THRESHOLD_MS} ms): ${passFail(maxFirst)}`,
  ]
  const verdict =
    maxTotal <= THRESHOLD_MS
      ? 'PASS (total)'
      : maxFirst <= THRESHOLD_MS
        ? 'PASS (first build only; onProgress must deliver builds one by one)'
        : 'FAIL (even the first build exceeds the threshold)'
  return [...lines, `${tag}expectedDamage verdict: ${verdict}`]
}

function report() {
  const maxLine = (metric: string, crafted: boolean) => {
    const tag = crafted ? '生産護石あり ' : ''
    const totals = measurements
      .filter((m) => m.metric === metric && m.crafted === crafted)
      .map((m) => m.totalMs)
    if (totals.length === 0) return []
    const max = Math.max(...totals)
    return [
      `max total ms over ${tag}${metric} cases and runs: ${fmt(max)} (threshold ${THRESHOLD_MS} ms): ${passFail(max)}`,
    ]
  }
  const rows = measurements.map((m) => ({
    case: m.label,
    run: m.run,
    status: m.status,
    builds: m.builds,
    solves: m.solveMs.length,
    'total ms': fmt(m.totalMs),
    'first ms': m.firstMs === undefined ? '-' : fmt(m.firstMs),
    'solve max ms': fmt(Math.max(0, ...m.solveMs)),
    'solve mean ms': fmt(m.solveMs.reduce((s, v) => s + v, 0) / Math.max(1, m.solveMs.length)),
    'nodes max': Math.max(0, ...m.nodes),
    'lp iter max': Math.max(0, ...m.lpIterations),
  }))
  const lines = [
    `HiGHS version: ${highs.version.string} (${highs.version.gitHash})`,
    `master version: ${master.version} (armors=${master.armors.length} decorations=${master.decorations.length} skills=${master.skills.length} setBonuses=${master.setBonuses.length} weapons=${master.weapons.length})`,
    `environment: node ${process.version}, ${process.platform} ${process.arch}, ${os.cpus()[0]?.model ?? 'unknown cpu'} x${os.cpus().length}`,
    ...maxLine('defense', false),
    ...maxLine('defense', true),
    ...damageLines(false),
    ...damageLines(true),
  ]
  console.log(lines.join('\n'))
  console.table(rows)
  console.log(
    'per-solve ms (run 1..3 of each case):\n' +
      measurements
        .map((m) => `${m.label} #${m.run}: [${m.solveMs.map(fmt).join(', ')}]`)
        .join('\n'),
  )
}

describe('solveBuilds の測定（実データ）', () => {
  beforeAll(async () => {
    // HiGHS の初期化とマスターの読み込みは時間に含めない
    highs = await highsLoader()
    master = loadRealMaster()
  })

  afterAll(() => {
    if (measurements.length > 0) report()
  })

  it.each([...CASES, ...DAMAGE_CASES, ...CRAFTED_CASES])('$label', async (testCase) => {
    await measureCase(testCase)
  })
})
