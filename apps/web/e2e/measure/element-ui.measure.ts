/**
 * ブラウザ（Chromium）の Worker 上の「属性の最大化」の測定（機能 023・受入基準 12。
 * `pnpm --filter @swv/web run measure`）。CI では実行しない。時間は検査（assert）せず console に出す。
 * 条件は damage-ui.measure.ts と同じ（実データ・発動条件すべてオン・件数 10・下位+上位・
 * 6 ケース × 各 3 回・生産護石のオンとオフ）。武器は、マスターの先頭の 5 属性の武器（plan D12）。
 * 状態の検査: 武器スキルで解の有無が変わりうるので、解あり・解なしのどちらも可。エラーの表示なら失敗。
 * 1件目までの時間 = 「検索」を押してから構成 1 のカードが出るまで。合計時間 = 結果が出るまで。
 */
import { expect, test, type Page } from '@playwright/test'
import { CASES, fillRequiredSkills, master, type MeasureCase } from '../support/measureCases'
import { searchButton, setRanks } from '../support/search'

const REPEATS = 3
const LIMIT_MS = 5000
const CHARM_MODES = [false, true] as const
const weapon = master.elementWeapon()

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
  await fillRequiredSkills(page, testCase, weapon.id)
  await page.getByRole('radio', { name: '属性の最大化' }).check()
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
const verdict = (ms: number) => (ms <= LIMIT_MS ? 'PASS' : 'FAIL')

/** 1件目までの時間（NaN を除く）の最大。無ければ NaN。 */
function maxFirstMs(list: Measurement[]): number {
  const firsts = list.map((m) => m.firstMs).filter((v) => !Number.isNaN(v))
  return firsts.length > 0 ? Math.max(...firsts) : Number.NaN
}

function summaryLine(name: string, list: Measurement[]): string {
  if (list.length === 0) return `${name}: no data`
  const maxFirst = maxFirstMs(list)
  return [
    `[${name}] max total ms: ${fmt(Math.max(...list.map((m) => m.totalMs)))}`,
    `max first-build ms: ${fmt(maxFirst)}`,
    `<=${LIMIT_MS} ms: ${verdict(maxFirst)}`,
  ].join(' / ')
}

test.describe.configure({ mode: 'serial' })
test.setTimeout(300_000)

test.describe('023 Worker 上の属性の最大化の測定（実データ）', () => {
  for (const testCase of CASES) {
    for (const charm of CHARM_MODES) {
      test(`${testCase.label} / ${charmName(charm)}`, async ({ page }) => {
        for (let run = 1; run <= REPEATS; run++) {
          await fillConditions(page, testCase, charm)
          const result = await searchOnce(page)
          measurements.push({ label: testCase.label, charm, run, ...result })
          // 解あり・解なしのどちらも可。エラーの表示なら失敗
          expect(result.state).not.toBe('error')
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
        `weapon: ${weapon.id} (${weapon.type} ${weapon.value})`,
        `condition: 目的=属性の最大化 / 発動条件=すべてオン / ランク=下位+上位 / 件数=10 / 各 ${REPEATS} 回 / 上限=30000 ms`,
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
        totalMs: fmt(m.totalMs),
        firstMs: fmt(m.firstMs),
      })),
    )
  })
})
