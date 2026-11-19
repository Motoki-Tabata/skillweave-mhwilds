import { expect, test, type Locator, type Page } from '@playwright/test'
import { SK } from './support/measureCases'
import { loadMasterInfo } from './support/masterData'
import { addSkills, openSearch, searchButton, selectWeapon, setSkillLevel } from './support/search'

// 属性の種類の表示名（画面設計 2.3。画面の文言の正）
const ELEMENT_NAMES: Record<string, string> = {
  fire: '火属性',
  water: '水属性',
  thunder: '雷属性',
  ice: '氷属性',
  dragon: '龍属性',
  poison: '毒属性',
  paralysis: '麻痺属性',
  sleep: '睡眠属性',
  blastblight: '爆破属性',
}

const master = loadMasterInfo()
const elementWeapon = master.elementWeapon()
const statusWeapon = master.statusWeapon()

function displayNameOf(type: string): string {
  const name = ELEMENT_NAMES[type]
  if (name === undefined) {
    throw new Error(
      `ELEMENT_NAMES に属性の種類 "${type}" の表示名が無い（マスターデータの種類が増えた可能性）`,
    )
  }
  return name
}

const elementName = displayNameOf(elementWeapon.type)
const statusName = displayNameOf(statusWeapon.type)

const CAP_NOTE = (name: string) => `${name}値は、スキルによる強化の上限を考えずに計算しています。`
const BUILD_COUNT = 5

/** 武器と必須スキル（体術 Lv3）を入れる。目的・検索は呼び出し側。 */
async function fillConditions(page: Page, weaponId: string): Promise<void> {
  await openSearch(page)
  await selectWeapon(page, master.nameOf(weaponId))
  await addSkills(page, [master.nameOf(SK.taijutsu)])
  if (3 < master.maxLevelOf(SK.taijutsu)) await setSkillLevel(page, master.nameOf(SK.taijutsu), 3)
  const input = page
    .getByRole('textbox', { name: '件数', exact: true })
    .or(page.getByRole('spinbutton', { name: '件数', exact: true }))
  await input.fill(String(BUILD_COUNT))
  await input.blur()
  await expect(input).toHaveValue(String(BUILD_COUNT))
}

async function search(page: Page): Promise<void> {
  await searchButton(page).click()
  await expect(page.getByText(/\d+\s*件の構成が見つかりました/)).toBeVisible({ timeout: 60_000 })
}

function card(page: Page, n: number): Locator {
  return page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: `構成 ${n}`, exact: true }) })
}

/** 見出し行の「属性期待値 <値>」の値。 */
async function headerElementExpected(c: Locator): Promise<number> {
  const text = await c.locator('p', { hasText: '属性期待値' }).first().innerText()
  return Number(text.replace('属性期待値', '').trim())
}

/** 武器を選んだ後に、武器カードから開き直して別の武器を選ぶ。 */
async function reselectWeapon(page: Page, weaponName: string): Promise<void> {
  await page.getByRole('button', { name: /^武器 必須/ }).click()
  const dialog = page.getByRole('dialog', { name: '武器を選択' })
  // 開き直すと現在の武器の武器種で絞られているので、すべてに戻す
  await dialog.getByRole('button', { name: 'すべて', exact: true }).click()
  await dialog.getByRole('searchbox', { name: '武器名で検索' }).fill(weaponName)
  await dialog
    .getByRole('button', {
      name: new RegExp(`^${weaponName.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)}\\s`),
    })
    .first()
    .click()
  await expect(dialog).toBeHidden()
}

test.describe('023 element-damage', () => {
  test('AC-5・AC-6・AC-7: 5 属性の武器で属性の最大化を検索し、属性の値・注記・並びを確かめる', async ({
    page,
  }) => {
    await fillConditions(page, elementWeapon.id)
    await page.getByRole('radio', { name: '属性の最大化' }).check()
    await search(page)

    const first = card(page, 1)
    // AC-5: 火力の2行目に属性期待値と属性値（表示値は × 10）
    await expect(first.locator('dt:text-is("属性期待値")')).toBeVisible()
    const valueDd = first.locator(`div:has(> dt:text-is("${elementName}値")) > dd`)
    // スキルによる強化があるので、武器の素の値（マスターの値 × 10）以上
    const shown = Number(await valueDd.innerText())
    expect(shown).toBeGreaterThanOrEqual(elementWeapon.value * 10)
    // AC-6: 上限の注記
    await expect(first.getByText(CAP_NOTE(elementName))).toBeVisible()

    // AC-7: 構成 1 から順に、見出し行の属性期待値が増えない
    const values: number[] = []
    for (let n = 1; n <= BUILD_COUNT; n++) {
      const c = card(page, n)
      if ((await c.count()) === 0) break
      values.push(await headerElementExpected(c))
    }
    expect(values.length).toBeGreaterThan(1)
    for (const v of values) expect(Number.isFinite(v)).toBe(true)
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThanOrEqual(values[i - 1] ?? Number.NaN)
    }
  })

  test('AC-5・AC-6: 状態異常の武器は蓄積値と注記だけ、無属性の武器は何も出ない', async ({
    page,
  }) => {
    await fillConditions(page, statusWeapon.id)
    await page.getByRole('radio', { name: '火力の最大化' }).check()
    await search(page)
    const first = card(page, 1)
    await expect(first.locator(`dt:text-is("${statusName}値")`)).toBeVisible()
    await expect(first.getByText(CAP_NOTE(statusName))).toBeVisible()
    await expect(first.getByText('属性期待値')).toHaveCount(0)

    await fillConditions(page, master.plainWeaponId)
    await page.getByRole('radio', { name: '火力の最大化' }).check()
    await search(page)
    const plain = card(page, 1)
    await expect(plain.locator('dt:text-is("期待値")')).toBeVisible()
    await expect(plain.getByText('属性期待値')).toHaveCount(0)
    await expect(plain.getByText(/値は、スキルによる強化の上限/)).toHaveCount(0)
  })

  test('AC-9: 状態異常の武器では属性の最大化を選べず、選んだ後に武器を変えるとエラーで検索が止まる', async ({
    page,
  }) => {
    const radio = page.getByRole('radio', { name: '属性の最大化' })
    const reverse = page.getByRole('button', { name: '護石を逆引き' })

    // 状態異常の武器: 選べず、理由が出る
    await openSearch(page)
    await selectWeapon(page, master.nameOf(statusWeapon.id))
    await expect(radio).toBeDisabled()
    await expect(
      page.getByText(
        `選んだ武器（${statusName}）では選べません。火・水・雷・氷・龍属性の武器で選べます。`,
      ),
    ).toBeVisible()

    // 5 属性の武器で選んだ後に状態異常の武器へ選び直す: 選択は残り、エラーと検索の無効
    await reselectWeapon(page, master.nameOf(elementWeapon.id))
    await expect(radio).toBeEnabled()
    await radio.check()
    await reselectWeapon(page, master.nameOf(statusWeapon.id))
    await expect(radio).toBeChecked()
    await expect(
      page.getByText(
        `選んだ武器（${statusName}）では、属性の最大化で探せません。目的を選び直すか、火・水・雷・氷・龍属性の武器を選んでください。`,
      ),
    ).toBeVisible()
    await expect(searchButton(page)).toBeDisabled()
    await expect(
      page.getByText('目的の「属性の最大化」は、火・水・雷・氷・龍属性の武器でだけ探せます。'),
    ).toBeVisible()
    // 逆引きは目的を使わないので有効のまま
    await expect(reverse).toBeEnabled()
  })
})
