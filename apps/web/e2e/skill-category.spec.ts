import { expect, test } from '@playwright/test'
import { loadMasterInfo } from './support/masterData'
import { openSearch } from './support/search'

/** spec 022 で固定した 9 分類の ID と表示名（表示の順）。割当は実データから読む。 */
const CATEGORIES = [
  { id: 'attack', label: '攻撃' },
  { id: 'affinity', label: '会心' },
  { id: 'element', label: '属性・状態異常' },
  { id: 'sharpness', label: '斬れ味' },
  { id: 'weapon_specific', label: '武器種固有' },
  { id: 'defense', label: '防御・回復' },
  { id: 'resistance', label: '耐性' },
  { id: 'mobility', label: '行動・スタミナ' },
  { id: 'support', label: '探索・支援' },
]

const master = loadMasterInfo()
const present = new Set(master.weaponSkillCategoryIds())
const expectedHeadings = CATEGORIES.filter((c) => present.has(c.id)).map((c) => c.label)

test.describe('022 skill-category', () => {
  test('受入基準 12: 武器のタブで分類の見出しが順に並び、選んだスキルが必須スキルに入り、検索語を入れると見出しが消える', async ({
    page,
  }) => {
    await openSearch(page)
    await page.getByRole('button', { name: 'スキルを選ぶ' }).click()
    const dialog = page.getByRole('dialog', { name: 'スキルを選ぶ' })
    await dialog.getByRole('tab', { name: '武器', exact: true }).click()
    const panel = dialog.getByRole('tabpanel')
    const headings = panel.getByRole('heading', { level: 3 })

    // 見出しが用語の順に並ぶ
    expect(expectedHeadings.length).toBeGreaterThan(0)
    await expect(headings).toHaveText(expectedHeadings)

    // 最初の見出しの下から選ぶと、フッターと必須スキルの行に出る
    const section = panel.locator('section').filter({
      has: page.getByRole('heading', { level: 3, name: expectedHeadings[0], exact: true }),
    })
    const button = section.getByRole('button', { pressed: false }).first()
    const skillName = (await button.locator('span').first().innerText()).trim()
    await button.click()
    await expect(
      section.getByRole('button', { pressed: true }).filter({ hasText: skillName }),
    ).toHaveCount(1)
    await expect(
      dialog
        .getByRole('listitem')
        .filter({ hasText: skillName })
        .filter({ hasNot: page.getByRole('button') }),
    ).toHaveCount(1)
    await dialog.getByRole('button', { name: '閉じる', exact: true }).last().click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('combobox', { name: `${skillName}の下限レベル` })).toBeVisible()

    // 検索語を入れると見出しが消える（残る h3 はフッターの 1 つだけ）
    await page.getByRole('button', { name: 'スキルを選ぶ' }).click()
    await dialog.getByRole('searchbox', { name: 'スキル名で検索' }).fill(skillName)
    await expect(dialog.getByRole('tabpanel')).toHaveCount(0)
    await expect(dialog.getByRole('heading', { level: 3 })).toHaveCount(1)
  })
})
