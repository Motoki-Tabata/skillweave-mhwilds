/**
 * ブラウザ（Chromium）の Worker 上の「火力の最大化」の測定（機能 007・受入基準 14。
 * `pnpm --filter @swv/web run measure`）。CI では実行しない。時間は検査（assert）せず console に出す。
 * 019 と同じ条件: 実データ・発動条件のトグルをすべてオン・マスターの先頭の武器・
 * 件数 10・候補のランクはすべて・必須スキル 3／6／10 個 × 解あり／解なし・各 3 回。
 * 時間の上限は画面の SOLVE_TIMEOUT_MS（30 秒）。打ち切りは件数と打ち切られた旨を出力する。
 * 1件目までの時間 = 「検索」を押してから逐次表示（または結果）の構成 1 のカードが出るまで。
 * 合計時間 = 「検索」を押してから検索中の表示が消えて結果が出るまで。
 * 「生産護石を候補に含める」のオン・オフの両方を測る（機能 024・受入基準 6）。
 * 状態の検査: 解ありは構成が1件以上、解なしは解なしの表示。違えば失敗にする。
 * ただし生産護石オンの解なしは、構成あり・解なしのどちらも可（エラー表示なら失敗）。
 */
import { expect, test, type Page } from '@playwright/test'
import { CASES, fillRequiredSkills, master, type MeasureCase } from '../support/measureCases'
import { searchButton, setRanks } from '../support/search'

const REPEATS = 3
const THRESHOLD_MS = 3000
const LIMIT_MS = 5000
const CHARM_MODES = [false, true] as const

interface Measurement {
  label: string
  charm: boolean
  run: number
  totalMs: number
  firstMs: number
  state: string
  count: number
}

const measurements: Measurement[] = []

/** 検索の条件を、画面の操作で入れる（検索は押さない）。 */
async function fillConditions(page: Page, testCase: MeasureCase, charm: boolean): Promise<void> {
  await fillRequiredSkills(page, testCase)
  await page.getByRole('radio', { name: '火力の最大化' }).check()
  await setRanks(page, { low: true, high: true })
  await page.getByRole('checkbox', { name: '生産護石を候補に含める' }).setChecked(charm)
  const toggles = page.getByRole('group', { name: '発動条件' }).getByRole('checkbox')
  const total = await toggles.count()
  expect(total).toBeGreaterThan(0)
  for (let i = 0; i < total; i++) await toggles.nth(i).setChecked(true)
}

async function searchOnce(
  page: Page,
): Promise<Pick<Measurement, 'totalMs' | 'firstMs' | 'state' | 'count'>> {
  const found = page.getByText(/\d+\s*件の構成が見つかりました/)
  const infeasible = page.getByText('条件を満たす構成が見つかりませんでした')
  const timeout = page.getByText('時間の上限で検索を打ち切りました。')
  const failed = page.getByText('検索できませんでした')
  const done = found.or(infeasible).or(timeout).or(failed).first()
  const firstCard = page.getByRole('heading', { level: 3, name: '構成 1', exact: true })

  const button = searchButton(page)
  await expect(button).toBeEnabled()
  const start = performance.now()
  await button.click()
  let firstMs: number | null = null
  void firstCard
    .waitFor({ timeout: 60_000 })
    .then(() => {
      firstMs ??= performance.now() - start
    })
    .catch(() => undefined)
  await done.waitFor({ timeout: 60_000 })
  const totalMs = performance.now() - start
  // 逐次表示を経ずに結果で初めて出たときは、結果が出た時刻を1件目までの時間とする
  if (firstMs === null && (await firstCard.isVisible())) firstMs = totalMs

  const count = await page.getByRole('heading', { level: 3, name: /^構成 \d+$/ }).count()
  let state = 'error'
  if (await infeasible.isVisible()) state = 'infeasible'
  else if (await timeout.first().isVisible()) state = 'timeout'
  else if (await found.isVisible()) state = 'found'
  return { totalMs, firstMs: firstMs ?? Number.NaN, state, count }
}

const fmt = (ms: number) => ms.toFixed(1)
const charmName = (charm: boolean) => (charm ? '生産護石オン' : '生産護石オフ')
const verdict = (ms: number, limit: number) => (ms <= limit ? 'PASS' : 'FAIL')

/** 状態の検査。オフ・オンの解ありは構成1件以上。解なしはオフなら解なしの表示、オンは構成あり・解なしのどちらも可。 */
function checkState(
  testCase: MeasureCase,
  charm: boolean,
  result: Pick<Measurement, 'state' | 'count'>,
): void {
  if (testCase.expected === 'found') expect(result.count).toBeGreaterThan(0)
  else if (!charm) expect(result.state).toBe('infeasible')
  else {
    expect(result.state).not.toBe('error')
    expect(result.state === 'infeasible' || result.count > 0).toBe(true)
  }
}

/** 1件目までの時間（NaN を除く）の最大。無ければ NaN。 */
function maxFirstMs(list: Measurement[]): number {
  const firsts = list.map((m) => m.firstMs).filter((v) => !Number.isNaN(v))
  return firsts.length > 0 ? Math.max(...firsts) : Number.NaN
}

function summaryLine(name: string, list: Measurement[]): string {
  if (list.length === 0) return `${name}: no data`
  const maxTotal = Math.max(...list.map((m) => m.totalMs))
  const maxFirst = maxFirstMs(list)
  return [
    `[${name}] max total ms: ${fmt(maxTotal)}`,
    `max first-build ms: ${fmt(maxFirst)}`,
    `<=${THRESHOLD_MS} ms: ${verdict(maxFirst, THRESHOLD_MS)}`,
    `<=${LIMIT_MS} ms: ${verdict(maxFirst, LIMIT_MS)}`,
  ].join(' / ')
}

test.describe.configure({ mode: 'serial' })
test.setTimeout(300_000)

test.describe('007 Worker 上の火力の最大化の測定（実データ）', () => {
  for (const testCase of CASES) {
    for (const charm of CHARM_MODES) {
      test(`${testCase.label} / ${charmName(charm)}`, async ({ page }) => {
        for (let run = 1; run <= REPEATS; run++) {
          // 前の結果が残って判定が早まらないよう、毎回画面を開き直して条件を入れる
          await fillConditions(page, testCase, charm)
          const result = await searchOnce(page)
          measurements.push({ label: testCase.label, charm, run, ...result })
          checkState(testCase, charm, result)
        }
      })
    }
  }

  test.afterAll(({ browser }) => {
    if (measurements.length === 0) return
    console.log(
      [
        `browser: chromium ${browser.version()}`,
        `master version: ${master.version}`,
        `condition: 目的=火力の最大化 / 発動条件=すべてオン / ランク=下位+上位 / 件数=10 / 各 ${REPEATS} 回 / 上限=30000 ms`,
        summaryLine(
          '生産護石オン',
          measurements.filter((m) => m.charm),
        ),
        summaryLine(
          '生産護石オフ',
          measurements.filter((m) => !m.charm),
        ),
        summaryLine('全体', measurements),
      ].join('\n'),
    )
    console.table(
      measurements.map((m) => ({
        case: m.label,
        charm: charmName(m.charm),
        run: m.run,
        state: m.state,
        builds: m.count,
        timedOut: m.state === 'timeout',
        totalMs: fmt(m.totalMs),
        firstMs: fmt(m.firstMs),
      })),
    )
  })
})
