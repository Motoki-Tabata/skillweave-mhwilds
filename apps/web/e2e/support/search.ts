import { expect, type Locator, type Page } from '@playwright/test'

/** 正規表現の特殊文字をエスケープする。 */
function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
}

/** 画面を開き、マスター・辞書・HiGHS の読み込みが終わる（条件フォームが出る）まで待つ。 */
export async function openSearch(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: '装備検索' })).toBeVisible({
    timeout: 60_000,
  })
  await expect(page.getByRole('button', { name: '武器を選択' })).toBeVisible({ timeout: 60_000 })
}

/** 武器のダイアログから、名前で絞り込んで武器を選ぶ。 */
export async function selectWeapon(page: Page, weaponName: string): Promise<void> {
  await page.getByRole('button', { name: '武器を選択' }).click()
  const dialog = page.getByRole('dialog', { name: '武器を選択' })
  await dialog.getByRole('searchbox', { name: '武器名で検索' }).fill(weaponName)
  // ボタンの名前は「<武器名> <武器種> 攻撃力 …」。名前が先頭に一致するものに絞る
  await dialog
    .getByRole('button', { name: new RegExp(`^${escapeRegExp(weaponName)}\\s`) })
    .first()
    .click()
  await expect(dialog).toBeHidden()
}

/** スキルのダイアログから、名前で絞り込んで必須スキルを追加する（下限は最大レベル）。 */
export async function addSkills(page: Page, skillNames: string[]): Promise<void> {
  await page.getByRole('button', { name: 'スキルを選ぶ' }).click()
  const dialog = page.getByRole('dialog', { name: 'スキルを選ぶ' })
  const search = dialog.getByRole('searchbox', { name: 'スキル名で検索' })
  for (const name of skillNames) {
    await search.fill(name)
    // 検索中のボタンの名前は「<スキル名> [選択中] <種類名>」。名前が完全に一致するものを押す
    const button = dialog.getByRole('button', {
      name: new RegExp(`^${escapeRegExp(name)} (選択中 )?(武器|防具|シリーズ|グループ)$`),
      pressed: false,
    })
    await button.click()
  }
  await dialog.getByRole('button', { name: '閉じる', exact: true }).last().click()
  await expect(dialog).toBeHidden()
}

/** 追加済みの必須スキルの下限レベルを選ぶ。 */
export async function setSkillLevel(page: Page, skillName: string, level: number): Promise<void> {
  await page.getByRole('combobox', { name: `${skillName}の下限レベル` }).click()
  await page.getByRole('option', { name: `Lv${level}`, exact: true }).click()
}

/** 候補にするランクのチェックを、指定どおりにする。 */
export async function setRanks(page: Page, ranks: { low: boolean; high: boolean }): Promise<void> {
  await page.getByRole('checkbox', { name: '下位', exact: true }).setChecked(ranks.low)
  await page.getByRole('checkbox', { name: '上位', exact: true }).setChecked(ranks.high)
}

export function searchButton(page: Page): Locator {
  return page.getByRole('button', { name: '検索', exact: true })
}
