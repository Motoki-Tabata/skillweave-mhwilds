/**
 * ブラウザ（Chromium）の Worker 上の測定（機能 004・受入基準 14。`pnpm --filter @swv/web run measure`）。
 * CI では実行しない。時間は検査（assert）せず、console に出力するだけ。
 * 003 の測定（packages/solver/src/test/solveBuilds.measure.ts）と同じ6ケース・スキル・下限で、
 * 目的は「防御力の最大化」、候補のランクは「下位」「上位」の両方、件数は既定の 10。
 * 「検索」を押してから結果が表示されるまでの時間（HiGHS の初期化とマスターの読み込みは含めない）。
 * 状態が 003 の期待（解あり／解なし）と違えば失敗にする。
 */
import { expect, test, type Page } from '@playwright/test'
import { loadMasterInfo } from '../support/masterData'
import {
  addSkills,
  openSearch,
  searchButton,
  selectWeapon,
  setRanks,
  setSkillLevel,
} from '../support/search'

const REPEATS = 3
const THRESHOLD_MS = 3000

/** 003 と同じ実データのスキル（ID。名前は辞書から引く） */
const SK = {
  fire: 'sk:-3666104', // 火竜の力（シリーズ）
  scale: 'sk:1487598336', // 鱗張りの技法（グループ）
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
type Expected = 'found' | 'infeasible'

interface Case {
  label: string
  required: Pair[]
  expected: Expected
}

const CASES: Case[] = [
  {
    label: 'k=3 解あり',
    required: [
      [SK.fire, 1],
      [SK.scale, 1],
      [SK.taijutsu, 3],
    ],
    expected: 'found',
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
    expected: 'found',
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
    expected: 'found',
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

interface Measurement {
  label: string
  run: number
  ms: number
  state: string
}

const master = loadMasterInfo()
const measurements: Measurement[] = []

/** 検索の条件を、画面の操作で入れる（検索は押さない）。 */
async function fillConditions(page: Page, testCase: Case): Promise<void> {
  await openSearch(page)
  await selectWeapon(page, master.nameOf(master.plainWeaponId))
  await addSkills(
    page,
    testCase.required.map(([id]) => master.nameOf(id)),
  )
  for (const [id, level] of testCase.required) {
    if (level < master.maxLevelOf(id)) await setSkillLevel(page, master.nameOf(id), level)
  }
  await page.getByRole('radio', { name: '防御力の最大化' }).check()
  await setRanks(page, { low: true, high: true })
}

/** 検索を押してから結果（構成の見出し・解なし・打ち切り・エラーのいずれか）が出るまでの時間と状態。 */
async function searchOnce(page: Page): Promise<{ ms: number; state: string }> {
  const found = page.getByText(/\d+\s*件の構成が見つかりました/)
  const infeasible = page.getByText('条件を満たす構成が見つかりませんでした')
  const timeout = page.getByText('時間の上限で検索を打ち切りました。')
  const failed = page.getByText('検索できませんでした')
  const done = found.or(infeasible).or(timeout).or(failed).first()

  const button = searchButton(page)
  await expect(button).toBeEnabled()
  const start = performance.now()
  await button.click()
  await done.waitFor({ timeout: 120_000 })
  const ms = performance.now() - start

  if (await found.isVisible()) {
    const text = (await found.textContent()) ?? ''
    return { ms, state: `found(${/\d+/.exec(text)?.[0] ?? '?'})` }
  }
  if (await infeasible.isVisible()) return { ms, state: 'infeasible' }
  if (await timeout.first().isVisible()) return { ms, state: 'timeout' }
  return { ms, state: 'error' }
}

const fmt = (ms: number) => ms.toFixed(1)

test.describe.configure({ mode: 'serial' })
test.setTimeout(300_000)

test.describe('004 Worker 上の測定（実データ）', () => {
  for (const testCase of CASES) {
    test(testCase.label, async ({ page }) => {
      for (let run = 1; run <= REPEATS; run++) {
        // 前の結果が残って判定が早まらないよう、毎回画面を開き直して条件を入れる
        await fillConditions(page, testCase)
        const { ms, state } = await searchOnce(page)
        measurements.push({ label: testCase.label, run, ms, state })
        if (testCase.expected === 'found') expect(state).toMatch(/^found\([1-9]\d*\)$/)
        else expect(state).toBe('infeasible')
      }
    })
  }

  test.afterAll(({ browser }) => {
    if (measurements.length === 0) return
    const maxMs = Math.max(...measurements.map((m) => m.ms))
    console.log(
      [
        `browser: chromium ${browser.version()}`,
        `master version: ${master.version}`,
        `condition: 目的=防御力の最大化 / ランク=下位+上位 / 件数=10 / 各 ${REPEATS} 回`,
        `max ms over all cases and runs: ${fmt(maxMs)} (threshold ${THRESHOLD_MS} ms): ${maxMs <= THRESHOLD_MS ? 'PASS' : 'FAIL'}`,
      ].join('\n'),
    )
    console.table(
      measurements.map((m) => ({ case: m.label, run: m.run, state: m.state, ms: fmt(m.ms) })),
    )
  })
})
