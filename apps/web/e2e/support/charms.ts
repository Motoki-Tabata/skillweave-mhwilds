import { expect, type Page } from '@playwright/test'
import { loadMasterInfo } from './masterData'

const skill = loadMasterInfo().kanjiArmorSkill()

/** 護石の画面を開き、フォームと一覧の見出しが出るまで待つ。 */
export async function openCharms(page: Page): Promise<void> {
  await page.goto('/charms')
  await expect(page.getByRole('heading', { level: 1, name: '護石', exact: true })).toBeVisible({
    timeout: 60_000,
  })
  await expect(page.getByRole('heading', { name: '護石を登録' })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('heading', { name: /^登録済みの護石（\d+）$/ })).toBeVisible()
}

/** スキル<row>に、読み（ひらがな）で検索して漢字の名前の候補を選ぶ。 */
export async function pickSkillByReading(page: Page, row: number): Promise<void> {
  const input = page.getByRole('combobox', { name: `スキル${row}`, exact: true })
  await input.fill(skill.reading)
  // 候補は「<スキル名> <種類>」。ひらがなの入力で漢字の名前の候補が出る
  // 前の行で選んだ候補の一覧が DOM に残ることがあるので、開いたばかりの最後の一覧を使う
  const option = page.getByRole('option', { name: `${skill.name} 防具`, exact: true }).last()
  await expect(option).toBeVisible()
  await option.click()
  await expect(input).toHaveValue(skill.name)
}

/** レア<rarity>・スキル1つ・スロット3つ（防具用 Lv3）の護石をフォームから登録する。 */
export async function registerCharm(page: Page, rarity = 8): Promise<void> {
  await page.getByRole('radio', { name: String(rarity), exact: true }).click()
  await pickSkillByReading(page, 1)
  for (const i of [1, 2, 3]) {
    await page.getByRole('combobox', { name: `スロット${i}`, exact: true }).click()
    await page.getByRole('option', { name: '防具用 Lv3', exact: true }).click()
  }
  await page.getByRole('button', { name: '登録', exact: true }).click()
  // 続けて登録すると前のトーストが残るので、先頭の1つで確かめる
  await expect(page.getByText('護石を登録しました。', { exact: true }).first()).toBeVisible()
}
