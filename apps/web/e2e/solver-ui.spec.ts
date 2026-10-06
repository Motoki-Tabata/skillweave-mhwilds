import { expect, test } from '@playwright/test'
import { loadMasterInfo } from './support/masterData'
import { addSkills, openSearch, searchButton, selectWeapon, setSkillLevel } from './support/search'

// 実データのスキル（ID は 003 の実データのテストと同じ。名前は辞書から引く）
const SKILL = {
  fire: 'sk:-3666104', // 火竜の力（シリーズ。最大 Lv2 = 4 部位）
  beast: 'sk:-62248528', // 闢獣の力（シリーズ。最大 Lv2 = 4 部位）
  taijutsu: 'sk:-1689391744', // 体術（防具。最大 Lv5）
  evade: 'sk:144660544', // 回避性能（防具。最大 Lv5）
}

const master = loadMasterInfo()

test.describe('004 solver-ui', () => {
  test('受入基準 13(a): 武器と必須スキルを選んで検索すると、構成カードが表示される', async ({
    page,
  }) => {
    await openSearch(page)
    await selectWeapon(page, master.nameOf(master.plainWeaponId))
    await addSkills(page, [master.nameOf(SKILL.taijutsu), master.nameOf(SKILL.evade)])
    // 下限は最大レベルで追加されるので、既定の条件（候補は上位だけ）で解がある Lv に下げる
    await setSkillLevel(page, master.nameOf(SKILL.taijutsu), 3)
    await setSkillLevel(page, master.nameOf(SKILL.evade), 2)

    await searchButton(page).click()

    await expect(page.getByText(/\d+\s*件の構成が見つかりました/)).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('heading', { level: 3, name: '構成 1', exact: true })).toBeVisible()
    // 構成カードに、必須スキルが発動スキルとして出ている
    const card = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: '構成 1', exact: true }) })
    await expect(card.getByText(`${master.nameOf(SKILL.taijutsu)} Lv3`).first()).toBeVisible()
    await expect(card.getByText(`${master.nameOf(SKILL.evade)} Lv2`).first()).toBeVisible()
    await expect(card.getByRole('rowheader', { name: '防御力の合計' })).toBeVisible()
  })

  test('受入基準 13(b): シリーズスキル2つで6部位以上を要する組は、解なしの表示になる', async ({
    page,
  }) => {
    await openSearch(page)
    await selectWeapon(page, master.nameOf(master.plainWeaponId))
    // シリーズスキルの下限は最大レベル（Lv2 = 4 部位）で追加される。2つで 8 部位を要する
    expect(master.maxLevelOf(SKILL.fire)).toBe(2)
    expect(master.maxLevelOf(SKILL.beast)).toBe(2)
    await addSkills(page, [master.nameOf(SKILL.fire), master.nameOf(SKILL.beast)])

    await searchButton(page).click()

    await expect(page.getByText('条件を満たす構成が見つかりませんでした')).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.getByText('必須スキルを減らす')).toBeVisible()
    await expect(page.getByText(/件の構成が見つかりました/)).toHaveCount(0)
  })

  test('受入基準 11: ヘッダーに二次創作のバッジ、下端にクレジットが表示される', async ({
    page,
  }) => {
    await openSearch(page)

    await expect(page.getByText('非公式の二次創作')).toBeVisible()
    const credit = page.getByRole('contentinfo')
    await expect(credit).toBeVisible()
    await expect(credit).toContainText('出典: LartTyler/mhdb-wilds-data @')
    await expect(page.getByText('©CAPCOM')).toHaveCount(0)
  })
})
