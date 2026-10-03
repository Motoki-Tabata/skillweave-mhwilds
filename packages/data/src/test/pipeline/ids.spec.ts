import { describe, expect, it } from 'vitest'
import {
  armorId,
  charmId,
  decorationId,
  setBonusId,
  skillId,
  weaponId,
} from '../../main/pipeline/ids.ts'

describe('ID の規則（受入基準 3）', () => {
  it('gameId から規則どおりの ID を作る', () => {
    expect(skillId(850626240)).toBe('sk:850626240')
    expect(armorId(-2117203456, 'head')).toBe('ar:-2117203456:head')
    expect(decorationId(-2144349312)).toBe('dc:-2144349312')
    expect(weaponId('charge-blade', 22)).toBe('wp:charge-blade:22')
    expect(charmId(-2084662144, 1)).toBe('ch:-2084662144:1')
    expect(setBonusId(-1432692352)).toBe('sb:-1432692352')
  })
})
