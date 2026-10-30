import { expect, type Page, test } from '@playwright/test'
import { loadMasterInfo } from './support/masterData'
import { addSkills, searchButton, setRanks } from './support/search'
import { openWeapons } from './support/weapons'

const master = loadMasterInfo()
const artiaName = master.artiaWeaponName()
const pair = master.grantPair()

type NavLink = '装備検索' | '個体差のある武器'

/** ナビの行のリンクから画面を移る。 */
async function goByNav(page: Page, linkName: NavLink): Promise<void> {
  await page
    .getByRole('navigation', { name: '画面の切り替え' })
    .getByRole('link', { name: linkName, exact: true })
    .click()
}

/** 付与スキルの Combobox に名前を入れ、候補を選ぶ。 */
async function pickBonus(page: Page, label: string, name: string): Promise<void> {
  const input = page.getByRole('combobox', { name: label, exact: true })
  await input.fill(name)
  await page.getByRole('option', { name, exact: true }).click()
  await expect(input).toHaveValue(name)
}

test.describe('008 user-weapon', () => {
  test('受入基準 1・3・5・6・8・9・14: 個体差のある武器を登録し、再読み込み後も残り、選んで火力の最大化で検索すると付与スキルを数えた構成が出る', async ({
    page,
  }) => {
    await openWeapons(page)
    await expect(page.getByRole('heading', { name: '登録済みの武器（0）' })).toBeVisible()

    await page.getByRole('combobox', { name: /^基の武器/ }).click()
    await page.getByRole('option', { name: artiaName, exact: true }).click()
    await page.getByRole('textbox', { name: /^攻撃力/ }).fill('200')
    await page.getByRole('textbox', { name: /^会心率/ }).fill('15')
    await page.getByRole('combobox', { name: '属性', exact: true }).click()
    await page.getByRole('option', { name: '火属性', exact: true }).click()
    await page.getByRole('textbox', { name: '属性値', exact: true }).fill('300')
    await page.getByRole('combobox', { name: 'スロット1', exact: true }).click()
    await page.getByRole('option', { name: 'Lv3', exact: true }).click()
    await pickBonus(page, 'シリーズスキル', pair.seriesName)
    await pickBonus(page, 'グループスキル', pair.groupName)
    await page.getByRole('button', { name: '登録', exact: true }).click()

    await expect(page.getByText('個体差のある武器を登録しました。', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: '登録済みの武器（1）' })).toBeVisible()
    const item = page.getByRole('listitem').filter({ hasText: '攻撃力 200' }).first()
    await expect(item).toContainText(artiaName)
    await expect(item).toContainText('会心 15%')
    await expect(item).toContainText('火属性 300')
    await expect(item).toContainText('スロット Lv3')
    await expect(item).toContainText(`${pair.seriesName}（シリーズ）`)
    await expect(item).toContainText(`${pair.groupName}（グループ）`)

    // 再読み込み（実際の IndexedDB から読み直す）の後も残る
    await page.reload()
    await expect(page.getByRole('heading', { name: '登録済みの武器（1）' })).toBeVisible({
      timeout: 60_000,
    })
    await expect(
      page.getByRole('listitem').filter({ hasText: '攻撃力 200' }).first(),
    ).toContainText(artiaName)

    // 検索画面で D1 の「個体差のある武器」の節から選ぶ
    await goByNav(page, '装備検索')
    await expect(page.getByRole('button', { name: '武器を選択' })).toBeVisible({ timeout: 60_000 })
    await page.getByRole('button', { name: '武器を選択' }).click()
    const dialog = page.getByRole('dialog', { name: '武器を選択' })
    await expect(dialog.getByRole('heading', { name: '個体差のある武器（1）' })).toBeVisible()
    await dialog.getByRole('button', { name: /個体差/ }).click()
    await expect(dialog).toBeHidden()

    // 防具だけでは満たせず、武器の付与スキルを部位数に数えると満たせる必須スキル
    await addSkills(page, [pair.seriesName, pair.groupName])
    await setRanks(page, { low: false, high: true })
    await page.getByRole('radio', { name: '火力の最大化' }).check()
    await searchButton(page).click()

    await expect(page.getByText(/\d+\s*件の構成が見つかりました/)).toBeVisible({ timeout: 60_000 })
    await expect(
      page.getByText(`武器: ${artiaName}（個体差）`, { exact: false }).first(),
    ).toBeVisible()
    const card = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: '構成 1', exact: true }) })
    const expected = Number(
      await card.locator('div:has(> dt:text-is("期待値")) > dd').first().innerText(),
    )
    expect(expected).toBeGreaterThan(0)
    await expect(card.getByText(`${pair.seriesName} Lv2`).first()).toBeVisible()
    await expect(card.getByText(`${pair.groupName} Lv1`).first()).toBeVisible()
  })

  test('受入基準 5・14: 攻撃力が範囲外の武器は保存されず、攻撃力の直下にエラーが出て、一覧の件数が変わらない', async ({
    page,
  }) => {
    await openWeapons(page)
    await expect(page.getByRole('heading', { name: '登録済みの武器（0）' })).toBeVisible()

    await page.getByRole('combobox', { name: /^基の武器/ }).click()
    await page.getByRole('option', { name: artiaName, exact: true }).click()
    await page.getByRole('textbox', { name: /^攻撃力/ }).fill('1000')
    await page.getByRole('textbox', { name: /^会心率/ }).fill('15')
    await page.getByRole('button', { name: '登録', exact: true }).click()

    await expect(page.getByRole('textbox', { name: /^攻撃力/ })).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    await expect(page.getByText('攻撃力は 1〜999 の整数で入力してください。')).toBeVisible()
    await expect(page.getByText('個体差のある武器を登録しました。', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: '登録済みの武器（0）' })).toBeVisible()
  })
})
