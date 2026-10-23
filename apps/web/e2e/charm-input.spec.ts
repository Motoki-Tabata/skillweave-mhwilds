import { expect, type Page, test } from '@playwright/test'
import { loadMasterInfo } from './support/masterData'
import { searchButton, selectWeapon } from './support/search'

const master = loadMasterInfo()
const skill = master.kanjiArmorSkill()

/** ナビの行のリンクから画面を移る。 */
async function goByNav(page: Page, linkName: '装備検索' | '護石'): Promise<void> {
  await page
    .getByRole('navigation', { name: '画面の切り替え' })
    .getByRole('link', { name: linkName, exact: true })
    .click()
}

/** スキル<row>に、読み（ひらがな）で検索して漢字の名前の候補を選ぶ。 */
async function pickSkillByReading(page: Page, row: number): Promise<void> {
  const input = page.getByRole('combobox', { name: `スキル${row}`, exact: true })
  await input.fill(skill.reading)
  // 候補は「<スキル名> <種類>」。ひらがなの入力で漢字の名前の候補が出る
  // 前の行で選んだ候補の一覧が DOM に残ることがあるので、開いたばかりの最後の一覧を使う
  const option = page.getByRole('option', { name: `${skill.name} 防具`, exact: true }).last()
  await expect(option).toBeVisible()
  await option.click()
  await expect(input).toHaveValue(skill.name)
}

async function openCharms(page: Page): Promise<void> {
  await page.goto('/charms')
  await expect(page.getByRole('heading', { level: 1, name: '護石', exact: true })).toBeVisible({
    timeout: 60_000,
  })
  await expect(page.getByRole('heading', { name: '護石を登録' })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('heading', { name: /^登録済みの護石（\d+）$/ })).toBeVisible()
}

test.describe('005 charm-input', () => {
  test('受入基準 15（1, 2, 3, 4, 8, 9）: 護石を登録し、再読み込み後も残り、検索の構成カードに護石が出る（(c) 読みでの検索を含む）', async ({
    page,
  }) => {
    await openCharms(page)
    await expect(page.getByRole('heading', { name: '登録済みの護石（0）' })).toBeVisible()

    await page.getByRole('radio', { name: '8', exact: true }).click()
    await pickSkillByReading(page, 1)
    for (const i of [1, 2, 3]) {
      await page.getByRole('combobox', { name: `スロット${i}`, exact: true }).click()
      await page.getByRole('option', { name: '防具用 Lv3', exact: true }).click()
    }
    await page.getByRole('button', { name: '登録', exact: true }).click()

    await expect(page.getByText('護石を登録しました。', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: '登録済みの護石（1）' })).toBeVisible()
    // 一覧の行（スキルのチップも listitem なので、レア度を含む外側の行を取る）
    const item = page.getByRole('listitem').filter({ hasText: 'レア8' }).first()
    await expect(item).toContainText(`${skill.name} Lv1`)
    await expect(item).toContainText('防具用 Lv3・防具用 Lv3・防具用 Lv3')

    // 再読み込み（実際の IndexedDB から読み直す）の後も残る
    await page.reload()
    await expect(page.getByRole('heading', { name: '登録済みの護石（1）' })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.getByRole('listitem').filter({ hasText: 'レア8' }).first()).toContainText(
      `${skill.name} Lv1`,
    )

    // ナビで検索画面へ行き、候補の件数を確かめる
    await goByNav(page, '装備検索')
    await expect(page.getByRole('button', { name: '武器を選択' })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText(/候補にする護石:\s*1\s*件/)).toBeVisible()

    await selectWeapon(page, master.nameOf(master.plainWeaponId))
    await page.getByRole('radio', { name: '空きスロットの最大化' }).click()
    await searchButton(page).click()

    await expect(page.getByText(/\d+\s*件の構成が見つかりました/)).toBeVisible({ timeout: 60_000 })
    const card = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: '構成 1', exact: true }) })
    const charm = card
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: '護石' }) })
    await expect(charm.getByText('護石なし')).toHaveCount(0)
    await expect(charm.getByText('8', { exact: true })).toBeVisible()
    await expect(charm).toContainText(`${skill.name} Lv1`)
    await expect(charm).toContainText('防具用 Lv3・防具用 Lv3・防具用 Lv3')
  })

  test('受入基準 15（5）: 同じスキルを2つ入れて登録すると保存されず、後の行の直下にエラーが出る', async ({
    page,
  }) => {
    await openCharms(page)
    await expect(page.getByRole('heading', { name: '登録済みの護石（0）' })).toBeVisible()

    await page.getByRole('radio', { name: '8', exact: true }).click()
    await pickSkillByReading(page, 1)
    await pickSkillByReading(page, 2)
    await page.getByRole('button', { name: '登録', exact: true }).click()

    // 後の行（スキル2）の直下に、同じスキルの行（スキル1）を示すエラーが出る
    await expect(page.getByRole('combobox', { name: 'スキル2', exact: true })).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    await expect(
      page.getByText('スキル1と同じスキルです。別のスキルを選ぶか空にしてください。'),
    ).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'スキル1', exact: true })).not.toHaveAttribute(
      'aria-invalid',
      'true',
    )
    await expect(page.getByText('護石を登録しました。', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: '登録済みの護石（0）' })).toBeVisible()
  })
})
