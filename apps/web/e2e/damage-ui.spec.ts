import { expect, test, type Locator, type Page } from '@playwright/test'
import { loadMasterInfo } from './support/masterData'
import { addSkills, openSearch, searchButton, selectWeapon } from './support/search'

// 実データのスキル・条件（ID は 003 の実データのテストと同じ。名前は辞書から引く）
const WEAK_POINT_SKILL = 'sk:-397570464' // 弱点特効（最大 Lv5。Lv5 で有効部位への攻撃時 会心率 +30%）
const WEAK_POINT_CONDITION = 'cd:weak_point' // 有効部位への攻撃

const master = loadMasterInfo()
const conditionName = master.nameOf(WEAK_POINT_CONDITION)

/** 件数を 1 にする（時間を短くするため）。 */
async function setMaxResults(page: Page, count: number): Promise<void> {
  const input = page
    .getByRole('textbox', { name: '件数', exact: true })
    .or(page.getByRole('spinbutton', { name: '件数', exact: true }))
  await input.fill(String(count))
  await input.blur()
  await expect(input).toHaveValue(String(count))
}

/** 構成 1 のカード。 */
function firstCard(page: Page): Locator {
  return page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: '構成 1', exact: true }) })
}

/** 構成カードの火力の節から、見出しの値を読む。 */
async function readExpected(card: Locator): Promise<number> {
  const text = await card.locator('div:has(> dt:text-is("期待値")) > dd').first().innerText()
  const value = Number(text)
  expect(Number.isFinite(value)).toBe(true)
  return value
}

/** 検索を押して、指定の要約（発動条件の表記）つきの結果が出るまで待ち、構成 1 の期待値を返す。 */
async function searchAndReadExpected(page: Page, summary: string): Promise<number> {
  await searchButton(page).click()
  await expect(page.getByText(/\d+\s*件の構成が見つかりました/)).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText(summary, { exact: false }).first()).toBeVisible()
  return readExpected(firstCard(page))
}

test.describe('007 damage-ui', () => {
  test('受入基準 1・3・6・7・15: 火力の最大化で検索し、トグルの反映・検索後の変更で不変・説明文と補完を確かめる', async ({
    page,
  }) => {
    await openSearch(page)
    await selectWeapon(page, master.nameOf(master.plainWeaponId))
    await addSkills(page, [master.nameOf(WEAK_POINT_SKILL)])
    await page.getByRole('radio', { name: '火力の最大化' }).check() // 受入基準 1
    await setMaxResults(page, 1)

    const toggle = page
      .getByRole('group', { name: '発動条件' })
      .getByRole('checkbox', { name: conditionName, exact: true })
    await expect(toggle).not.toBeChecked() // 既定はオフ（受入基準 2）

    // (1) トグルがすべてオフで検索した構成 1 の期待値（受入基準 3: activeConditionIds は空）
    const off = await searchAndReadExpected(page, '発動条件: なし')

    // (2) 有効部位への攻撃をオンにして検索し直した構成 1 の期待値は、(1) より大きい
    await toggle.check()
    const on = await searchAndReadExpected(page, `発動条件: ${conditionName}`)
    expect(on).toBeGreaterThan(off)

    // 受入基準 6: 検索の後にトグルをオフにしても、表示中の期待値と要約は変わらない
    await toggle.uncheck()
    await expect(page.getByText(`発動条件: ${conditionName}`).first()).toBeVisible()
    expect(await readExpected(firstCard(page))).toBe(on)

    // 受入基準 7・15: スキルの効果を開くと、弱点特効 Lv5 の説明文と補完が出る
    const card = firstCard(page)
    await card.getByRole('button', { name: /^スキルの効果を表示（\d+）$/ }).click()
    const term = card.getByRole('term').filter({ hasText: master.nameOf(WEAK_POINT_SKILL) })
    await expect(term).toContainText('Lv5')
    const detail = term.locator('xpath=following-sibling::dd[1]')
    await expect(detail).toContainText('会心率＋３０％') // ja の説明文（全角）
    await expect(detail).toContainText(`効果: 会心率 +30%（${conditionName}）`)
  })
})
