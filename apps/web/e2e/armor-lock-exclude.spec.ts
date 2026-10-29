import { expect, type Locator, type Page, test } from '@playwright/test'
import { loadMasterInfo } from './support/masterData'
import { addSkills, openSearch, searchButton, selectWeapon, setSkillLevel } from './support/search'

const TAIJUTSU = 'sk:-1689391744' // 体術（防具。最大 Lv5）

const master = loadMasterInfo()

/** 武器と必須スキルを選び、護石なしの条件にして検索し、結果が出るまで待つ。 */
async function searchBuilds(page: Page): Promise<void> {
  await searchButton(page).click()
  await expect(page.getByText(/\d+\s*件の構成が見つかりました/)).toBeVisible({ timeout: 60_000 })
}

async function prepare(page: Page): Promise<void> {
  await openSearch(page)
  await selectWeapon(page, master.nameOf(master.plainWeaponId))
  await addSkills(page, [master.nameOf(TAIJUTSU)])
  await setSkillLevel(page, master.nameOf(TAIJUTSU), 3)
  await page.getByRole('checkbox', { name: '生産護石を候補に含める' }).uncheck()
}

/** 部位の固定の入力欄で、名前の候補を選ぶ。 */
async function lockPart(page: Page, partLabel: string, optionName: string): Promise<void> {
  const input = page.getByRole('combobox', { name: partLabel, exact: true })
  await input.fill(optionName)
  await page.getByRole('option', { name: optionName, exact: true }).click()
  await expect(input).toHaveValue(optionName)
}

/** 除外の探す欄から、名前で防具・装飾品を除外に足す。 */
async function addExclusion(page: Page, name: string): Promise<void> {
  const input = page.getByRole('combobox', { name: '防具・装飾品を探す' })
  await input.fill(name)
  await page.getByRole('option', { name }).first().click()
  await expect(page.getByRole('button', { name: `${name}を除外から外す` })).toBeVisible()
}

function buildCards(page: Page): Locator {
  return page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: /^構成 \d+$/ }) })
}

/** 構成カードの防具の表で、部位の行の防具名の列。 */
function armorCell(card: Locator, partLabel: string): Locator {
  return card
    .getByRole('table', { name: '防具', exact: true })
    .getByRole('row')
    .filter({ has: card.page().getByRole('cell', { name: partLabel, exact: true }) })
    .getByRole('cell')
    .nth(1)
}

async function expectEveryBuildPart(page: Page, partLabel: string, text: string): Promise<void> {
  const cards = buildCards(page)
  const count = await cards.count()
  expect(count).toBeGreaterThan(0)
  for (let i = 0; i < count; i++) {
    await expect(armorCell(cards.nth(i), partLabel)).toHaveText(text)
  }
}

test.describe('020 armor-lock-exclude', () => {
  test('AC-11(a): 頭を防具に固定すると、結果のどの構成も頭がその防具になる', async ({ page }) => {
    const head = master.headArmorWithSkill(TAIJUTSU)
    await prepare(page)
    await lockPart(page, '頭', head)

    await searchBuilds(page)

    await expectEveryBuildPart(page, '頭', head)
  })

  test('AC-11(b): 部位を「何も付けない」にすると、結果のどの構成もその部位が空になる', async ({
    page,
  }) => {
    await prepare(page)
    await lockPart(page, '腰', '何も付けない')

    await searchBuilds(page)

    await expectEveryBuildPart(page, '腰', '防具なし')
  })

  test('AC-11(c): 除外した防具・装飾品が、結果のどの構成にも出ない', async ({ page }) => {
    await prepare(page)
    await searchBuilds(page)
    // 除外しなければ出る防具・装飾品を、除外前の結果の先頭の構成から取る
    const first = buildCards(page).first()
    const armorName = (await armorCell(first, '頭').innerText()).trim()
    const decorationCell = first
      .getByRole('table', { name: '装飾品', exact: true })
      .getByRole('row')
      .nth(1)
      .getByRole('cell')
      .nth(2)
    const decorationName = (await decorationCell.innerText()).trim()
    expect(armorName).not.toBe('防具なし')
    expect(decorationName).not.toBe('')

    await addExclusion(page, armorName)
    await addExclusion(page, decorationName)
    await searchBuilds(page)

    const cards = buildCards(page)
    expect(await cards.count()).toBeGreaterThan(0)
    await expect(cards.getByRole('cell', { name: armorName, exact: true })).toHaveCount(0)
    await expect(cards.getByRole('cell', { name: decorationName, exact: true })).toHaveCount(0)
  })
})
