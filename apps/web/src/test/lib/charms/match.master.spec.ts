import { describe, expect, it } from 'vitest'
import { matchCharm } from '@/lib/charms/match'
import type { CharmPayload } from '@/lib/charms/types'
import { bundle, dictionary } from '../../support/masterFixture'
import { ownedAppraisedCharms } from '../../support/ownedAppraisedCharms'

const nameOf = (id: string) => dictionary.entries[id].name

const title = (c: CharmPayload) =>
  `レア${c.rarity}: ${c.skills.map((s) => `${nameOf(s.skillId)} Lv${s.level}`).join(' / ')}`

// 実際のマスターの抽選テーブルとの照合（受入基準 5・6・8）
describe('matchCharm（実マスター）', () => {
  // AC-5: 手持ちの鑑定護石は全件、抽選テーブルに合格する
  it.each(ownedAppraisedCharms.map((c) => [title(c), c] as const))(
    'AC-5: 手持ちの護石が合格する（%s）',
    (_title, c) => {
      expect(matchCharm(c, bundle, nameOf)).toEqual({ status: 'pass' })
    },
  )

  // AC-6: 表に入れたレア度は固定値（外したレア度は無いので、パターンが無いレア度の「未検査」は空集合）
  it.each([5, 6, 7, 8])(
    'AC-6: レア%i は、どのパターンにも無いスロットの並びで不一致になる',
    (rarity) => {
      const base = ownedAppraisedCharms.find((c) => c.rarity === rarity)
      if (!base) throw new Error(`fixture にレア${rarity}の護石がありません`)
      // スキルは合うので、不一致の原因はスロットだけになる
      const charm: CharmPayload = {
        ...base,
        slots: [
          { target: 'armor', level: 3 },
          { target: 'armor', level: 3 },
          { target: 'armor', level: 3 },
        ],
      }
      expect(matchCharm(charm, bundle, nameOf)).toEqual({
        status: 'mismatch',
        issues: [
          `スロットの並び「防具用 Lv3・防具用 Lv3・防具用 Lv3」は、レア${rarity}にありません。`,
        ],
      })
    },
  )
})
