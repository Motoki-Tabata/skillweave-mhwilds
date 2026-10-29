import { expect, test } from '@playwright/test'
import { mockApi } from './support/buildsApi'
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
    await expect(card.getByRole('button', { name: '構成 1 を保存', exact: true })).toBeVisible()
    await expect(card.getByText('生産護石を使った構成は保存できません。')).toHaveCount(0)
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

test.describe('027 crafted-charm-build-save', () => {
  test('AC-5・AC-6・AC-7・AC-10: 鑑定護石なしで生産護石の構成を保存すると、参照だけを送り、保存した構成の画面で護石の名前が出る', async ({
    page,
  }) => {
    const api = await mockApi(page, { loggedIn: true })
    await fillConditions(page)
    await searchButton(page).click()
    await expect(page.getByText(/\d+\s*件の構成が見つかりました/)).toBeVisible({ timeout: 60_000 })

    await page.getByRole('button', { name: '構成 1 を保存', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '構成を保存' })
    await expect(dialog).toBeVisible()
    const name = 'e2e 生産護石の構成'
    await dialog.getByRole('textbox', { name: /名前/ }).fill(name)
    await dialog.getByRole('button', { name: '保存', exact: true }).click()

    await expect(
      page.getByText(`「${name}」を保存しました。「保存した構成」から開けます。`, { exact: true }),
    ).toBeVisible()
    expect(api.posts).toHaveLength(1)
    expect(api.posts[0]!.payload.charm).toEqual({ kind: 'crafted', charmId: 'ch:-2057181952:1' })

    await page
      .getByRole('navigation', { name: '画面の切り替え' })
      .getByRole('link', { name: '保存した構成', exact: true })
      .click()
    await page.getByRole('link', { name, exact: true }).click()

    await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.getByRole('heading', { name: '構成の内容', exact: true })).toBeVisible()
    await expect(page.getByText('にぎりめしの護石').first()).toBeVisible()
  })
})
