import { expect, test } from '@playwright/test'
import { loadMasterInfo } from './support/masterData'
import { addSkills, openSearch, searchButton, selectWeapon } from './support/search'

const NIGIRIMESHI_SKILL = 'sk:10503' // にぎりめし（生産護石「にぎりめしの護石」でだけ満たせる）

const master = loadMasterInfo()

/** 鑑定護石なしで、必須スキル「にぎりめし」の条件を入れる（検索は押さない）。 */
async function fillConditions(page: import('@playwright/test').Page): Promise<void> {
  await openSearch(page)
  await selectWeapon(page, master.nameOf(master.plainWeaponId))
  await addSkills(page, [master.nameOf(NIGIRIMESHI_SKILL)])
}

test.describe('021 crafted-charm', () => {
  test('AC-11（1）: 既定（オン）で、生産護石を使った構成が出て、保存の操作が出ず、要約に「生産護石を含める」が出る', async ({
    page,
  }) => {
    await fillConditions(page)
    const toggle = page.getByRole('checkbox', { name: '生産護石を候補に含める' })
    await expect(toggle).toBeChecked()

    await searchButton(page).click()

    await expect(page.getByText(/\d+\s*件の構成が見つかりました/)).toBeVisible({ timeout: 60_000 })
    const card = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: '構成 1', exact: true }) })
    await expect(card.getByText('にぎりめしの護石').first()).toBeVisible()
    await expect(card.getByText('生産護石を使った構成は保存できません。')).toBeVisible()
    await expect(page.getByRole('button', { name: /^構成 \d+ を保存$/ })).toHaveCount(0)
    await expect(page.getByText(/生産護石を含める(?!ない)/).last()).toBeVisible()
    await expect(page.getByText(/ ／ 生産護石を含める ／ /)).toBeVisible()
  })

  test('AC-11（2）: 切り替えをオフにして同じ条件で検索すると、解なしになる', async ({ page }) => {
    await fillConditions(page)
    await page.getByRole('checkbox', { name: '生産護石を候補に含める' }).uncheck()

    await searchButton(page).click()

    await expect(page.getByText('条件を満たす構成が見つかりませんでした')).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.getByRole('button', { name: /^構成 \d+ を保存$/ })).toHaveCount(0)
  })
})
