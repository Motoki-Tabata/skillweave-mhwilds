import { describe, expect, it } from 'vitest'
import { savedMasterOf } from '@/lib/builds/savedMaster'
import { NAMES, cd, dc, makeBundle, sk, wp } from '../../support/fixtures'

// 011 AC-4・AC-5（保存した構成が引く、現在のマスターの索引）
describe('savedMasterOf', () => {
  const bundle = makeBundle()
  const source = {
    bundle,
    nameOf: (id: string) => NAMES[id] ?? id,
    armorById: new Map(bundle.armors.map((a) => [a.id, a])),
    decorationById: new Map(bundle.decorations.map((d) => [d.id, d])),
    skillById: new Map(bundle.skills.map((s) => [s.id, s])),
    weaponById: new Map(bundle.weapons.map((w) => [w.id, w])),
  }

  it('マスターが無ければ null', () => {
    expect(savedMasterOf({ ...source, bundle: null })).toBeNull()
  })

  it('現在の版と、装飾品・発動条件の有無の判定を返す', () => {
    const master = savedMasterOf(source)!
    expect(master.version).toBe(bundle.version)
    expect(master.hasDecoration(dc('1'))).toBe(true)
    expect(master.hasDecoration('dc:gone')).toBe(false)
    expect(master.hasCondition(cd('weak_point'))).toBe(true)
    expect(master.hasCondition('cd:gone')).toBe(false)
    expect(master.weaponById.has(wp('great-sword:1'))).toBe(true)
    expect(master.skillById.has(sk('a1'))).toBe(true)
  })
})
