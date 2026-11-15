import { expect, test, type Page } from '@playwright/test'
import { loadMasterInfo } from './support/masterData'
import { addSkills, openSearch, searchButton, selectWeapon, setSkillLevel } from './support/search'

// 実データ（2026.11.1）で確かめて選んだスキル（ID は solver-ui.spec.ts と同じ流儀で直書きし、名前は辞書から引く）。
// - GROUP_SKILL（体術・防具スキル・最大 Lv5）: 抽選テーブルのグループに載っているので護石が持ちうる。
//   防具でも満たせるので、通常の検索でも構成が出る（AC-12）。Lv3 は solver-ui.spec.ts で既定の条件で解がある値。
//   スキルを持たない先頭の武器でも、逆引きの候補が見つかる（AC-1・AC-4）。
// - FIRE・BEAST（火竜の力・闢獣の力・シリーズ・最大 Lv2 = 各 4 部位）: 2 つで 8 部位を要し、防具は 5 部位なので、
//   護石をどう置き換えても満たせない。護石はシリーズスキルを持てない（AC-7）。solver-ui.spec.ts の受入基準 13(b) と同じ組。
const GROUP_SKILL = 'sk:-1689391744'
const FIRE = 'sk:-3666104'
const BEAST = 'sk:-62248528'

const master = loadMasterInfo()

async function startReverse(page: Page): Promise<void> {
  await page.getByRole('button', { name: '護石を逆引き' }).click()
}

test.describe('017 reverse-lookup', () => {
  test('AC-1・AC-4: 抽選テーブルのグループにある必須スキルで逆引きすると、狙う護石と構成が出る', async ({
    page,
  }) => {
    await openSearch(page)
    await selectWeapon(page, master.nameOf(master.plainWeaponId))
    await addSkills(page, [master.nameOf(GROUP_SKILL)])
    await setSkillLevel(page, master.nameOf(GROUP_SKILL), 3)

    await startReverse(page)

    await expect(page.getByRole('heading', { level: 2, name: '逆引きの結果' })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.getByRole('heading', { level: 3, name: '候補 1', exact: true })).toBeVisible({
      timeout: 60_000,
    })
    const card = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: '候補 1', exact: true }) })
    await expect(card.getByRole('heading', { level: 4, name: '狙う護石' })).toBeVisible()
    // 「スロット」は構成の表の見出しにもあるので、狙う護石の定義リスト（dt）に絞る
    for (const label of ['レア度', 'スキル', 'スロット']) {
      await expect(card.locator('dt', { hasText: new RegExp(`^${label}$`) })).toBeVisible()
    }
    await expect(page.getByText('抽選テーブル: レア5・レア6・レア7・レア8')).toBeVisible()
  })

  test('AC-7: どの護石でも満たせない条件では、満たせない旨が出る', async ({ page }) => {
    await openSearch(page)
    await selectWeapon(page, master.nameOf(master.plainWeaponId))
    // シリーズスキルの下限は最大レベル（Lv2 = 4 部位）で追加される
    await addSkills(page, [master.nameOf(FIRE), master.nameOf(BEAST)])

    await startReverse(page)

    await expect(page.getByText('抽選テーブルのどの護石でも条件を満たせません')).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.getByRole('heading', { level: 3, name: /^候補 / })).toHaveCount(0)
  })

  test('AC-12: 逆引きの後に検索を押すと、通常の検索の結果が出る', async ({ page }) => {
    await openSearch(page)
    await selectWeapon(page, master.nameOf(master.plainWeaponId))
    await addSkills(page, [master.nameOf(GROUP_SKILL)])
    await setSkillLevel(page, master.nameOf(GROUP_SKILL), 3)

    await startReverse(page)
    await expect(page.getByRole('heading', { level: 2, name: '逆引きの結果' })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.getByRole('heading', { level: 3, name: '候補 1', exact: true })).toBeVisible({
      timeout: 60_000,
    })

    await searchButton(page).click()

    await expect(page.getByRole('heading', { level: 2, name: '検索結果' })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.getByText(/\d+\s*件の構成が見つかりました/)).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('heading', { level: 3, name: '構成 1', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: '逆引きの結果' })).toHaveCount(0)
  })
})
