/**
 * 測定ハーネス（機能 001・受入基準 9。`pnpm --filter @swv/solver run measure`）。
 * CI では実行しない。時間は検査（assert）せず、console に出力するだけ。
 * 一部のケースだけ走らせるときは `-t "k=3 解あり"` のように名前で絞る。
 */
import os from 'node:os'
import highsLoader, { type Highs } from 'highs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { searchBuilds } from '../main/searchBuilds'
import type { SearchResult, SkillLevel } from '../main/types'
import {
  generateData,
  makeFeasibleRequired,
  makeInfeasibleRequired,
  toInput,
  type SyntheticData,
} from './support/syntheticData'

const DATA_SEED = 20261003
const CASE_SEED = 1
const REPEATS = 3
const THRESHOLD_MS = 3000
const SKILL_COUNTS = [3, 6, 10]

interface Measurement {
  label: string
  run: number
  totalMs: number
  solveMs: number[]
  builds: number
  status: SearchResult['status']
}

let highs: Highs
let data: SyntheticData
const measurements: Measurement[] = []

/** withModel が渡すモデルの run() ごとに時間を計る（src/main に計測用の引数を足さない） */
function instrument(target: Highs, solveMs: number[]): Highs {
  const timeRun = (model: object) =>
    new Proxy(model, {
      get(m, prop) {
        const value: unknown = Reflect.get(m, prop, m)
        if (prop === 'run' && typeof value === 'function') {
          return (...args: unknown[]) => {
            const start = performance.now()
            const result: unknown = value.apply(m, args)
            solveMs.push(performance.now() - start)
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

function measureCase(label: string, required: SkillLevel[], expected: SearchResult['status']) {
  for (let run = 1; run <= REPEATS; run++) {
    const solveMs: number[] = []
    const input = toInput(data, required)
    const start = performance.now()
    const result = searchBuilds(instrument(highs, solveMs), input)
    const totalMs = performance.now() - start
    measurements.push({
      label,
      run,
      totalMs,
      solveMs,
      builds: result.builds.length,
      status: result.status,
    })
    // 解なしのケースが infeasible を返したこと（解ありは optimal）を確かめる
    expect(result.status).toBe(expected)
  }
}

const fmt = (ms: number) => ms.toFixed(1)

function report() {
  const maxTotal = Math.max(...measurements.map((m) => m.totalMs))
  const rows = measurements.map((m) => ({
    case: m.label,
    run: m.run,
    status: m.status,
    builds: m.builds,
    solves: m.solveMs.length,
    'total ms': fmt(m.totalMs),
    'solve max ms': fmt(Math.max(0, ...m.solveMs)),
    'solve mean ms': fmt(m.solveMs.reduce((s, v) => s + v, 0) / Math.max(1, m.solveMs.length)),
  }))
  const lines = [
    `HiGHS version: ${highs.version.string} (${highs.version.gitHash})`,
    `environment: node ${process.version}, ${process.platform} ${process.arch}, ${os.cpus()[0]?.model ?? 'unknown cpu'} x${os.cpus().length}`,
    `data: seed=${DATA_SEED} armors=${data.armors.length} charms=${data.charms.length} decorations=${data.decorations.length}`,
    `max total ms over all cases and runs: ${fmt(maxTotal)} (threshold ${THRESHOLD_MS} ms): ${maxTotal <= THRESHOLD_MS ? 'PASS' : 'FAIL'}`,
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

describe('searchBuilds の測定', () => {
  beforeAll(async () => {
    // HiGHS の初期化は時間に含めない
    highs = await highsLoader()
    data = generateData(DATA_SEED)
  })

  afterAll(() => {
    if (measurements.length > 0) report()
  })

  it.each(SKILL_COUNTS)('k=%i 解あり', (k) => {
    measureCase(`k=${k} 解あり`, makeFeasibleRequired(data, CASE_SEED * 100 + k, k), 'optimal')
  })

  it.each(SKILL_COUNTS)('k=%i 解なし', (k) => {
    measureCase(`k=${k} 解なし`, makeInfeasibleRequired(data, CASE_SEED * 100 + k, k), 'infeasible')
  })
})
