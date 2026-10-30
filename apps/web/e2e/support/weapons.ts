import { expect, type Page } from '@playwright/test'
import { loadMasterInfo } from './masterData'

const artiaName = loadMasterInfo().artiaWeaponName()

/** 個体差のある武器の画面を開き、フォームと一覧の見出しが出るまで待つ。 */
export async function openWeapons(page: Page): Promise<void> {
  await page.goto('/weapons')
  await expect(page.getByRole('heading', { level: 1, name: '個体差のある武器' })).toBeVisible({
    timeout: 60_000,
  })
  await expect(page.getByRole('heading', { name: '武器を登録' })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('heading', { name: /^登録済みの武器（\d+）$/ })).toBeVisible()
}

/** 基の武器・攻撃力・会心率を入れて登録する。 */
export async function registerWeapon(page: Page, attack: number): Promise<void> {
  await page.getByRole('combobox', { name: /^基の武器/ }).click()
  await page.getByRole('option', { name: artiaName, exact: true }).click()
  await page.getByRole('textbox', { name: /^攻撃力/ }).fill(String(attack))
  await page.getByRole('textbox', { name: /^会心率/ }).fill('15')
  await page.getByRole('button', { name: '登録', exact: true }).click()
  await expect(page.getByText('個体差のある武器を登録しました。', { exact: true })).toBeVisible()
}
