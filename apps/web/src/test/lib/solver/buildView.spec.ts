import { describe, expect, it } from 'vitest'
import type { SolvedBuild, Uuid } from '@swv/solver'
import { NO_ARMOR_LABEL, toBuildView } from '@/lib/solver/buildView'
import type { BuildLookup } from '@/lib/solver/buildView'
import { NAMES, SKILLS, armorId, dc, makeBuild, makeBundle, sk, wp } from '../../support/fixtures'

// 受入基準 8（構成の表示項目）
describe('toBuildView', () => {
  const bundle = makeBundle()
  const weapon = bundle.weapons.find((w) => w.id === wp('great-sword:1'))
  const lookup: BuildLookup = {
    charm: () => undefined,
    armor: (id) => bundle.armors.find((a) => a.id === id),
    weaponSlots: weapon?.slots,
    skillKind: (id) => SKILLS.find((s) => s.id === id)?.kind,
    nameOf: (id) => NAMES[id] ?? (id.startsWith('ar:') ? `名:${id}` : id),
  }

  it('防具5部位を頭・胴・腕・腰・脚の順に出し、防具が無い部位は「防具なし」・防御力 0', () => {
    const view = toBuildView(makeBuild(), lookup)
    expect(view.armors.map((r) => r.partLabel)).toEqual(['頭', '胴', '腕', '腰', '脚'])
    expect(view.armors[0]).toMatchObject({ name: `名:${armorId('high', 'head')}`, defense: 20 })
    expect(view.armors.slice(1).map((r) => [r.name, r.defense])).toEqual(
      Array(4).fill([NO_ARMOR_LABEL, 0]),
    )
  })

  it('防御力の合計は防具の defense の合計', () => {
    const build: SolvedBuild = {
      ...makeBuild(),
      armor: {
        head: armorId('high', 'head'),
        chest: armorId('low', 'chest'),
        arms: null,
        waist: armorId('high', 'waist'),
        legs: null,
      },
    }
    expect(toBuildView(build, lookup).defenseTotal).toBe(20 + 10 + 20)
  })

  it('装飾品は持ち主・スロットの Lv・名前', () => {
    const view = toBuildView(makeBuild(), lookup)
    expect(view.decorations).toEqual([{ ownerLabel: '頭', slotLevel: 2, name: NAMES[dc('1')] }])
  })

  it('武器のスロットに付けた装飾品は武器のスロットの Lv', () => {
    const build: SolvedBuild = {
      ...makeBuild(),
      decorations: [{ slot: { owner: 'weapon', index: 0 }, decorationId: dc('1') }],
    }
    expect(toBuildView(build, lookup).decorations[0]).toMatchObject({
      ownerLabel: '武器',
      slotLevel: 3,
    })
  })

  // 受入基準 8（個体差のある武器のスロットに付けた装飾品）
  it('個体差のある武器のスロット（送信した時点の写し）の Lv を、装飾品と空きスロットに出す', () => {
    const build: SolvedBuild = {
      ...makeBuild(),
      decorations: [{ slot: { owner: 'weapon', index: 1 }, decorationId: dc('1') }],
      freeSlots: [{ owner: 'weapon', index: 0 }],
    }
    const view = toBuildView(build, { ...lookup, weaponSlots: [{ level: 2 }, { level: 1 }] })
    expect(view.decorations[0]).toMatchObject({ ownerLabel: '武器', slotLevel: 1 })
    expect(view.freeSlots[0]).toMatchObject({ ownerLabel: '武器', slotLevel: 2 })
  })

  it('持ち主が護石・防具なし・武器がマスターに無いときのスロット Lv は null', () => {
    const build: SolvedBuild = {
      ...makeBuild(),
      decorations: [
        { slot: { owner: 'charm', index: 0 }, decorationId: dc('1') },
        { slot: { owner: 'chest', index: 0 }, decorationId: dc('1') },
        { slot: { owner: 'weapon', index: 0 }, decorationId: dc('1') },
      ],
    }
    const view = toBuildView(build, { ...lookup, weaponSlots: undefined })
    expect(view.decorations.map((d) => [d.ownerLabel, d.slotLevel])).toEqual([
      ['護石', null],
      ['胴', null],
      ['武器', null],
    ])
  })

  it('発動スキルは種類の順（武器・防具）にまとめ、該当が無い種類は出さない', () => {
    const view = toBuildView(makeBuild(), lookup)
    expect(view.skillGroups.map((g) => g.label)).toEqual(['武器', '防具'])
    expect(view.skillGroups[0].chips).toEqual([{ name: NAMES[sk('w1')], level: 2 }])
    expect(view.skillGroups[1].chips).toEqual([{ name: NAMES[sk('a1')], level: 1 }])
  })

  it('発動スキルのレベルは level（頭打ち後）を出し、rawLevel は出さない', () => {
    const build: SolvedBuild = {
      ...makeBuild(),
      skills: [{ skillId: sk('a1'), level: 3, rawLevel: 5 }],
    }
    expect(toBuildView(build, lookup).skillGroups[0].chips).toEqual([
      { name: NAMES[sk('a1')], level: 3 },
    ])
  })

  it('空きスロットは持ち主と Lv', () => {
    const view = toBuildView(makeBuild(), lookup)
    expect(view.freeSlots).toEqual([
      { ownerLabel: '武器', slotLevel: 3 },
      { ownerLabel: '武器', slotLevel: 1 },
    ])
  })
})

// 受入基準 9（構成の護石の節と護石のスロットの Lv）
describe('toBuildView の護石', () => {
  const bundle = makeBundle()
  const charm = {
    id: '018f0000-0000-7000-8000-000000000001' as Uuid,
    rarity: 8,
    skills: [
      { skillId: sk('a1'), level: 2 },
      { skillId: sk('w1'), level: 1 },
    ],
    slots: [
      { target: 'weapon' as const, level: 1 as const },
      { target: 'armor' as const, level: 3 as const },
    ],
  }
  const lookup: BuildLookup = {
    charm: (id) => (id === charm.id ? charm : undefined),
    armor: (id) => bundle.armors.find((a) => a.id === id),
    weaponSlots: undefined,
    skillKind: (id) => SKILLS.find((s) => s.id === id)?.kind,
    nameOf: (id) => NAMES[id] ?? id,
  }
  const withCharm = (build: SolvedBuild): SolvedBuild => ({ ...build, charmId: charm.id })

  it('護石を使わない構成の charm は null', () => {
    expect(toBuildView(makeBuild(), lookup).charm).toBeNull()
  })

  it('使った護石のレア度・スキル（並び順）・スロットを出す', () => {
    expect(toBuildView(withCharm(makeBuild()), lookup).charm).toEqual({
      name: null,
      rarity: 8,
      skills: [
        { name: NAMES[sk('a1')], level: 2 },
        { name: NAMES[sk('w1')], level: 1 },
      ],
      slots: [
        { targetLabel: '武器用', level: 1 },
        { targetLabel: '防具用', level: 3 },
      ],
    })
  })

  // AC-7
  it('生産護石（ch: の ID）は辞書の名前を name に持ち、鑑定護石は null', () => {
    const craftedCharm = { ...charm, id: 'ch:-1:2' as typeof charm.id }
    const withLookup: BuildLookup = {
      ...lookup,
      charm: (id) => (id === craftedCharm.id ? craftedCharm : undefined),
      nameOf: (id) => (id === craftedCharm.id ? '攻撃の護石Ⅱ' : lookup.nameOf(id)),
    }
    const build = { ...makeBuild(), charmId: craftedCharm.id }
    expect(toBuildView(build, withLookup).charm?.name).toBe('攻撃の護石Ⅱ')
    expect(toBuildView(withCharm(makeBuild()), lookup).charm?.name).toBeNull()
  })

  it('候補に無い護石の ID なら charm は null', () => {
    const build = { ...makeBuild(), charmId: 'x' as Uuid }
    expect(toBuildView(build, lookup).charm).toBeNull()
  })

  it('護石のスロットに付けた装飾品と空きスロットの Lv は護石の slots から引く', () => {
    const build: SolvedBuild = {
      ...withCharm(makeBuild()),
      decorations: [{ slot: { owner: 'charm', index: 1 }, decorationId: dc('1') }],
      freeSlots: [
        { owner: 'charm', index: 0 },
        { owner: 'charm', index: 5 },
      ],
    }
    const view = toBuildView(build, lookup)
    expect(view.decorations).toEqual([{ ownerLabel: '護石', slotLevel: 3, name: NAMES[dc('1')] }])
    expect(view.freeSlots).toEqual([
      { ownerLabel: '護石', slotLevel: 1 },
      { ownerLabel: '護石', slotLevel: null },
    ])
  })
})
