import { describe, expect, it } from 'vitest'
import type { SolvedBuild } from '@swv/solver'
import { evaluateDamage } from '@swv/solver'
import {
  NO_ARMOR_LABEL,
  savedBuildView,
  toBuildView,
  unknownArmorName,
  unknownCharmName,
  unknownConditionName,
  unknownDecorationName,
  unknownSkillName,
  unknownWeaponName,
} from '@/lib/solver/buildView'
import type { BuildLookup, SavedBuildMaster } from '@/lib/solver/buildView'
import type { BuildPayload } from '@/lib/api/builds'
import { minimalPayload, savedBuild } from '../../support/builds'
import { NAMES, SKILLS, armorId, makeBuild, makeBundle, sk, wp } from '../../support/fixtures'

const bundle = makeBundle()
const crafted = makeBundle({ craftedCharms: true })
const GONE_ARMOR = 'ar:999:head'
const GONE_DECORATION = 'dc:999'
const GONE_SKILL = 'sk:999'

const lookup: BuildLookup = {
  charm: () => undefined,
  armor: (id) => bundle.armors.find((a) => a.id === id),
  weaponSlots: undefined,
  skillKind: (id) => SKILLS.find((s) => s.id === id)?.kind,
  nameOf: (id) => NAMES[id] ?? id,
  hasDecoration: (id) => bundle.decorations.some((d) => d.id === id),
}

// 受入基準 5（現在のマスターに無い ID）
describe('toBuildView の現在のマスターに無い ID', () => {
  const build: SolvedBuild = {
    ...makeBuild(),
    armor: { ...makeBuild().armor, head: GONE_ARMOR as never, chest: armorId('high', 'chest') },
    decorations: [{ slot: { owner: 'head', index: 0 }, decorationId: GONE_DECORATION as never }],
    skills: [
      { skillId: sk('a1'), level: 1, rawLevel: 1 },
      { skillId: GONE_SKILL as never, level: 2, rawLevel: 2 },
    ],
  }

  it('AC-5: 防具は「不明な防具（<ID>）」、known は false、防御力の合計に数えない', () => {
    const view = toBuildView(build, lookup)
    expect(view.armors[0]).toMatchObject({
      name: unknownArmorName(GONE_ARMOR),
      defense: 0,
      known: false,
    })
    expect(view.armors[0].name).toBe(`不明な防具（${GONE_ARMOR}）`)
    expect(view.armors[1].known).toBe(true)
    expect(view.defenseTotal).toBe(view.armors[1].defense)
  })

  it('AC-5: 防具なしは known のまま「防具なし」', () => {
    expect(toBuildView(makeBuild(), lookup).armors[1]).toMatchObject({
      name: NO_ARMOR_LABEL,
      known: true,
    })
  })

  it('AC-5: 装飾品は「不明な装飾品（<ID>）」。lookup が判定を渡さないときは名前を引く', () => {
    expect(toBuildView(build, lookup).decorations[0].name).toBe(
      unknownDecorationName(GONE_DECORATION),
    )
    const { hasDecoration: _unused, ...withoutCheck } = lookup
    expect(toBuildView(build, withoutCheck).decorations[0].name).toBe(GONE_DECORATION)
  })

  it('AC-5: 種類が分からないスキルは最後の「不明」の行に「不明なスキル（<ID>）」で並べる', () => {
    const groups = toBuildView(build, lookup).skillGroups
    expect(groups.map((g) => g.label)).toEqual(['防具', '不明'])
    expect(groups[1]).toMatchObject({
      kind: 'unknown',
      chips: [{ name: unknownSkillName(GONE_SKILL), level: 2 }],
    })
  })

  it('AC-5: 護石のスキルも名前の索引ではなくマスターの索引で不明を判定する', () => {
    const charm = {
      id: '01900000-0000-7000-8000-0000000000c1' as never,
      rarity: 8,
      skills: [{ skillId: GONE_SKILL as never, level: 1 }],
      slots: [],
    }
    const view = toBuildView(
      { ...makeBuild(), charmId: charm.id },
      { ...lookup, charm: () => charm },
    )
    expect(view.charm?.skills).toEqual([{ name: unknownSkillName(GONE_SKILL), level: 1 }])
  })

  it('AC-5: 未知の ID を含んでも火力の計算ができ、未知の発動スキルは寄与しない', () => {
    const base = { attack: 100, affinity: 0 }
    const known = evaluateDamage(bundle, base, [{ skillId: sk('a1'), level: 1 }], [])
    const withGone = evaluateDamage(
      bundle,
      base,
      [
        { skillId: sk('a1'), level: 1 },
        { skillId: GONE_SKILL as never, level: 2 },
      ],
      [],
    )
    expect(withGone).toEqual(known)
  })
})

describe('savedBuildView', () => {
  const master: SavedBuildMaster = {
    version: 'test-1',
    nameOf: (id) => NAMES[id] ?? id,
    armorById: new Map(bundle.armors.map((a) => [a.id, a])),
    hasDecoration: (id) => bundle.decorations.some((d) => d.id === id),
    skillById: new Map(bundle.skills.map((s) => [s.id, s])),
    weaponById: new Map(bundle.weapons.map((w) => [w.id, w])),
    charmById: new Map(crafted.charms.map((c) => [c.id, c])),
    hasCondition: (id) => bundle.conditions.some((c) => c.id === id),
  }
  const greatSword = bundle.weapons.find((w) => w.id === wp('great-sword:1'))!

  const view = (payload: BuildPayload, version = 'test-1') =>
    savedBuildView(savedBuild(1, { payload, masterVersion: version }), master)

  it('AC-4: 発動スキル・空きスロット・装飾品は保存した値から SolvedBuild にする', () => {
    const solvedSource = makeBuild()
    const result = view(
      minimalPayload({
        armor: { head: armorId('high', 'head'), chest: null, arms: null, waist: null, legs: null },
        decorations: solvedSource.decorations,
        skills: solvedSource.skills,
        freeSlots: solvedSource.freeSlots,
      }),
    )
    expect(result.solved).toEqual(solvedSource)
  })

  it('027 AC-7: 生産護石の形は charmId を ID とし、全ランクの索引から引く（最上位でないランクも）', () => {
    const rank1 = view(minimalPayload({ charm: { kind: 'crafted', charmId: 'ch:-1:1' } }))
    expect(rank1.solved.charmId).toBe('ch:-1:1')
    expect(toBuildView(rank1.solved, rank1.lookup).charm).toMatchObject({
      name: NAMES['ch:-1:1'] ?? 'ch:-1:1',
      known: true,
      rarity: 5,
    })
    expect(rank1.charms.get('ch:-1:1')?.skills).toEqual([{ skillId: sk('a1'), level: 1 }])
  })

  it('027 AC-8: マスターに無い生産護石は known=false・rarity=null で、スロットの Lv は null', () => {
    const gone = view(
      minimalPayload({
        charm: { kind: 'crafted', charmId: 'ch:-9:3' },
        freeSlots: [{ owner: 'charm', index: 0 }],
      }),
    )
    const rows = toBuildView(gone.solved, gone.lookup)
    expect(rows.charm).toEqual({
      name: unknownCharmName('ch:-9:3'),
      known: false,
      rarity: null,
      skills: [],
      slots: [],
    })
    expect(unknownCharmName('ch:-9:3')).toBe('不明な護石（ch:-9:3）')
    expect(rows.freeSlots[0].slotLevel).toBeNull()
  })

  it('027 AC-4: 鑑定護石の形は known=true・name=null のまま、護石なしは charm=null', () => {
    const appraised = view(
      minimalPayload({
        charm: {
          id: '01900000-0000-7000-8000-0000000000c1',
          payload: { rarity: 8, skills: [], slots: [] },
        },
      }),
    )
    expect(toBuildView(appraised.solved, appraised.lookup).charm).toMatchObject({
      name: null,
      known: true,
      rarity: 8,
    })
    const none = view(minimalPayload())
    expect(toBuildView(none.solved, none.lookup).charm).toBeNull()
  })

  it('AC-4: マスターの武器のスロットと火力の基は現在のマスターから引く', () => {
    const result = view(minimalPayload())
    expect(result.lookup.weaponSlots).toEqual(greatSword.slots)
    expect(result.damageBase).toEqual({ attack: greatSword.attack, affinity: greatSword.affinity })
    expect(result.weaponName).toBe(NAMES[wp('great-sword:1')])
  })

  it('AC-4: 個体差のある武器は写しからスロット・火力の基・名前（個体差）を作る', () => {
    const custom = (name: string): BuildPayload =>
      minimalPayload({
        weapon: {
          kind: 'custom',
          id: '01900000-0000-7000-8000-0000000000aa',
          payload: {
            baseWeaponId: wp('great-sword:1'),
            name,
            attack: 321,
            affinity: 7,
            slots: [{ target: 'weapon', level: 2 }],
            seriesBonusId: null,
            groupBonusId: null,
          },
        },
      })
    const named = view(custom('マイ武器'))
    expect(named.weaponName).toBe('マイ武器（個体差）')
    expect(named.lookup.weaponSlots).toEqual([{ level: 2 }])
    expect(named.damageBase).toEqual({ attack: 321, affinity: 7 })
    expect(view(custom('')).weaponName).toBe(`${NAMES[wp('great-sword:1')]}（個体差）`)
  })

  it('AC-5: 基の武器がマスターに無い個体差のある武器も、写しだけで火力の基を持つ', () => {
    const result = view(
      minimalPayload({
        weapon: {
          kind: 'custom',
          id: '01900000-0000-7000-8000-0000000000aa',
          payload: {
            baseWeaponId: 'wp:great-sword:999',
            name: '',
            attack: 100,
            affinity: 0,
            slots: [],
            seriesBonusId: null,
            groupBonusId: null,
          },
        },
      }),
    )
    expect(result.weaponName).toBe(`${unknownWeaponName('wp:great-sword:999')}（個体差）`)
    expect(result.damageBase).toEqual({ attack: 100, affinity: 0 })
  })

  it('AC-5: マスターの武器が無いときは「不明な武器（<ID>）」・スロットなし・火力の基なし', () => {
    const result = view(
      minimalPayload({ weapon: { kind: 'master', weaponId: 'wp:great-sword:999' } }),
    )
    expect(result.weaponName).toBe('不明な武器（wp:great-sword:999）')
    expect(result.lookup.weaponSlots).toBeUndefined()
    expect(result.damageBase).toBeNull()
  })

  it('AC-4: 護石は写しを使い、charmId は写しの ID。護石なしは null', () => {
    const charmId = '01900000-0000-7000-8000-0000000000c1'
    const withCharm = view(
      minimalPayload({
        charm: {
          id: charmId,
          payload: { rarity: 8, skills: [{ skillId: 'sk:a1', level: 2 }], slots: [] },
        },
      }),
    )
    expect(withCharm.solved.charmId).toBe(charmId)
    expect(toBuildView(withCharm.solved, withCharm.lookup).charm?.rarity).toBe(8)
    expect(view(minimalPayload()).solved.charmId).toBeNull()
  })

  it('AC-5: 発動条件は名前を引き、無いものは「不明な発動条件（<ID>）」。火力の計算からは除く', () => {
    const result = view(minimalPayload({ activeConditionIds: ['cd:weak_point', 'cd:gone'] }))
    expect(result.conditions).toEqual([
      { id: 'cd:weak_point', name: NAMES['cd:weak_point'], known: true },
      { id: 'cd:gone', name: unknownConditionName('cd:gone'), known: false },
    ])
    expect(result.damageConditionIds).toEqual(['cd:weak_point'])
  })

  it('AC-5: 火力の計算に渡すスキルは現在のマスターにあるものだけ', () => {
    const result = view(
      minimalPayload({
        skills: [
          { skillId: sk('a1'), level: 1, rawLevel: 1 },
          { skillId: GONE_SKILL, level: 1, rawLevel: 1 },
        ],
      }),
    )
    expect(result.damageSkills.map((s) => s.skillId)).toEqual([sk('a1')])
    expect(result.solved.skills).toHaveLength(2)
  })

  it('AC-5: 版が違うときは両方の版を持ち、同じなら警告しない', () => {
    const differs = view(minimalPayload(), '2026.9.1')
    expect(differs).toMatchObject({
      versionDiffers: true,
      masterVersion: '2026.9.1',
      currentMasterVersion: 'test-1',
    })
    expect(view(minimalPayload()).versionDiffers).toBe(false)
  })

  it('AC-5: 装飾品・防具が無くても表示の材料を作れる', () => {
    const result = view(
      minimalPayload({
        armor: { head: GONE_ARMOR, chest: null, arms: null, waist: null, legs: null },
        decorations: [{ slot: { owner: 'head', index: 0 }, decorationId: GONE_DECORATION }],
      }),
    )
    const rows = toBuildView(result.solved, result.lookup)
    expect(rows.armors[0].name).toBe(unknownArmorName(GONE_ARMOR))
    expect(rows.decorations[0].name).toBe(unknownDecorationName(GONE_DECORATION))
  })
})
