/**
 * ブラウザ（Chromium）の Worker 上の測定（機能 004・受入基準 14。`pnpm --filter @swv/web run measure`）。
 * CI では実行しない。時間は検査（assert）せず、console に出力するだけ。
 * 003 の測定（packages/solver/src/test/solveBuilds.measure.ts）と同じ6ケース・スキル・下限で、
 * 目的は「防御力の最大化」、候補のランクは「下位」「上位」の両方、件数は既定の 10。
 * 「検索」を押してから結果が表示されるまでの時間（HiGHS の初期化とマスターの読み込みは含めない）。
 * 状態が 003 の期待（解あり／解なし）と違えば失敗にする。
 * 6ケースは support/measureCases.ts から読む（007 の damage-ui.measure.ts と共有）。
 */
import { expect, test, type Page } from '@playwright/test'
import { CASES, fillRequiredSkills, master, type MeasureCase } from '../support/measureCases'
import { searchButton, setRanks } from '../support/search'

const REPEATS = 3
const THRESHOLD_MS = 3000

interface Measurement {
  label: string
  run: number
  ms: number
  state: string
}

const measurements: Measurement[] = []

/** 検索の条件を、画面の操作で入れる（検索は押さない）。 */
async function fillConditions(page: Page, testCase: MeasureCase): Promise<void> {
  await fillRequiredSkills(page, testCase)
  await page.getByRole('radio', { name: '防御力の最大化' }).check()
  await setRanks(page, { low: true, high: true })
  await page.getByRole('checkbox', { name: '生産護石を候補に含める' }).uncheck()
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
