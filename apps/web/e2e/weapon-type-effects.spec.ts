import { expect, test, type Locator } from '@playwright/test'
import { loadMasterInfo } from './support/masterData'
import { addSkills, openSearch, searchButton, selectWeapon } from './support/search'

// 実データの代表のスキル（会心撃【属性】。Lv3 は 2 つの武器種の組。名前・値・武器種はマスターから引く）
const SKILL = 'sk:313598432'
const LEVEL = 3
const WEAPON_TYPE = 'long-sword'

// 武器種の略称は画面の文言。constants/weaponTypes.ts は e2e の tsconfig の対象外なので、期待値として固定で持つ
const SHORT_NAMES: Record<string, string> = {
  'great-sword': '大剣',
  'long-sword': '太刀',
  'sword-shield': '片手剣',
  'dual-blades': '双剣',
  hammer: 'ハンマー',
  'hunting-horn': '狩猟笛',
  lance: 'ランス',
  gunlance: 'ガンス',
  'switch-axe': 'スラアク',
  'charge-blade': 'チャアク',
  'insect-glaive': '操虫棍',
  'light-bowgun': 'ライト',
  'heavy-bowgun': 'ヘビィ',
  bow: '弓',
}

function weaponTypeShortName(id: string): string {
  const name = SHORT_NAMES[id]
  if (name === undefined) throw new Error(`略称が未定義の武器種: ${id}`)
  return name
}

const master = loadMasterInfo()
const skillName = master.nameOf(SKILL)
const effects = master.weaponTypeEffects(SKILL, LEVEL)

/** 補完の組の表記。値の書式は画面と同じ（小数 2 桁）。 */
function pair(effect: { value: number; weaponTypes: string[] }): string {
  return `${effect.value.toFixed(2)}［${effect.weaponTypes.map(weaponTypeShortName).join('・')}］`
}

/** 武器種を含む組と、含まない組。 */
const mine = effects.find((e) => e.weaponTypes.includes(WEAPON_TYPE))
const other = effects.find((e) => !e.weaponTypes.includes(WEAPON_TYPE))

test.describe('043 weapon-type-effects', () => {
  test('前提: 代表のスキルの Lv3 は 2 つの武器種の組を持つ', () => {
    expect(effects).toHaveLength(2)
    expect(mine).toBeDefined()
    expect(other).toBeDefined()
  })

  test('AC-9: スキルを選ぶダイアログの補完に、2 つの武器種の組の［］が出る', async ({ page }) => {
    if (mine === undefined || other === undefined) throw new Error('組が無い')
    await openSearch(page)
    await page.getByRole('button', { name: 'スキルを選ぶ' }).click()
    const dialog = page.getByRole('dialog', { name: 'スキルを選ぶ' })
    await dialog.getByRole('searchbox', { name: 'スキル名で検索' }).fill(skillName)
    await dialog.getByRole('button', { name: `${skillName}の説明` }).click()

    const section = dialog.getByRole('region', { name: `${skillName}の説明` })
    const row = section
      .locator('div', { has: page.getByText(`Lv${LEVEL}`, { exact: true }) })
      .last()
    await expect(row).toContainText(pair(mine))
    await expect(row).toContainText(pair(other))
  })

  test('AC-9・AC-10: 武器を太刀にして検索した構成カードの補完は、太刀の値と［太刀］だけになる', async ({
    page,
  }) => {
    if (mine === undefined || other === undefined) throw new Error('組が無い')
    await openSearch(page)
    await selectWeapon(page, master.weaponNameWithSkill(WEAPON_TYPE, SKILL, LEVEL))
    await addSkills(page, [skillName])
    await searchButton(page).click()
    await expect(page.getByText(/\d+\s*件の構成が見つかりました/)).toBeVisible({ timeout: 60_000 })

    const card: Locator = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: '構成 1', exact: true }) })
    await card.getByRole('button', { name: /^スキルの効果を表示（\d+）$/ }).click()
    const term = card.getByRole('term').filter({ hasText: skillName })
    await expect(term).toContainText(`Lv${LEVEL}`)
    const detail = term.locator('xpath=following-sibling::dd[1]')
    await expect(detail).toContainText(
      `効果: 属性の会心倍率 ${pair({ ...mine, weaponTypes: [WEAPON_TYPE] })}`,
    )
    // もう一方の組の値と［］は出ない
    await expect(detail).not.toContainText(other.value.toFixed(2))
    await expect(detail).not.toContainText(weaponTypeShortName(other.weaponTypes[0] ?? ''))
    await expect(detail).not.toContainText('／')
  })
})
