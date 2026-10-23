import { describe, expect, it } from 'vitest'
import { charmSummary } from '@/lib/charms/format'
import { NAMES, sk } from '../../support/fixtures'

const nameOf = (id: string) => NAMES[id] ?? id

// 受入基準 4（一覧の要約。読み上げと削除の確認に使う）
describe('charmSummary', () => {
  it('レア度・スキル（名前とレベル）・スロットを「・」でつなぐ', () => {
    expect(
      charmSummary(
        {
          rarity: 8,
          skills: [
            { skillId: sk('a1'), level: 2 },
            { skillId: sk('w1'), level: 1 },
          ],
          slots: [
            { target: 'weapon', level: 1 },
            { target: 'armor', level: 2 },
          ],
        },
        nameOf,
      ),
    ).toBe('レア8・攻撃 Lv2・剛刃 Lv1・武器用 Lv1・防具用 Lv2')
  })

  it('スキルが無ければ「スキルなし」、スロットが無ければ書かない', () => {
    expect(charmSummary({ rarity: 5, skills: [], slots: [] }, nameOf)).toBe('レア5・スキルなし')
  })
})
