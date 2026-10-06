import { describe, expect, it } from 'vitest'
import { convert } from '../../main/pipeline/convert.ts'
import type { MhdbInput } from '../../main/pipeline/mhdb.ts'
import { CONFIG, makeInput } from '../support/fixtures.ts'

const run = (input: MhdbInput = makeInput()) => convert(input, CONFIG)

describe('変換（受入基準 3・4）', () => {
  it('ID を gameId から作り、取得元と版を記録する（3・13）', () => {
    const { bundle } = run()
    expect(bundle.version).toBe('9.9.9')
    expect(bundle.source).toEqual({ repository: 'owner/repo', commit: 'abc123' })
    expect(bundle.skills.map((s) => s.id)).toEqual(['sk:100', 'sk:101', 'sk:200', 'sk:201'])
    expect(bundle.armors.map((a) => a.id)).toEqual([
      'ar:10:head',
      'ar:10:chest',
      'ar:11:head',
      'ar:11:chest',
    ])
    expect(bundle.decorations[0]?.id).toBe('dc:1')
    expect(bundle.weapons.map((w) => w.id)).toEqual(['wp:charge-blade:22', 'wp:bow:3', 'wp:bow:4'])
    expect(bundle.charms.map((c) => c.id)).toEqual(['ch:5:1', 'ch:5:2'])
    expect(bundle.setBonuses.map((s) => s.id)).toEqual(['sb:200', 'sb:201'])
  })

  it('スキルの set を series に読み替え、最大レベルと空の効果を持つ（4）', () => {
    const { bundle } = run()
    expect(bundle.skills.map((s) => s.kind)).toEqual(['armor', 'weapon', 'series', 'group'])
    expect(bundle.skills[0]).toEqual({
      id: 'sk:100',
      kind: 'armor',
      maxLevel: 2,
      effectsByLevel: [],
    })
  })

  it('防具の防御力は最大値、スロットは防具用、部位の set／group スキルは setBonusIds に振り分ける（4）', () => {
    const head = run().bundle.armors[0]
    expect(head).toEqual({
      id: 'ar:10:head',
      part: 'head',
      rarity: 5,
      rank: 'high',
      slots: [
        { target: 'armor', level: 1 },
        { target: 'armor', level: 3 },
      ],
      skills: [{ skillId: 'sk:100', level: 2 }],
      setBonusIds: ['sb:200', 'sb:201'],
      defense: 50,
    })
  })

  it('武器のスロットは武器用で、element・status を element に、無ければ省く（4）', () => {
    const { weapons } = run().bundle
    expect(weapons[0]).toMatchObject({
      attack: 200,
      affinity: 5,
      slots: [{ target: 'weapon', level: 2 }],
      element: { type: 'fire', value: 30 },
      setBonusIds: [],
      skills: [{ skillId: 'sk:101', level: 1 }],
    })
    expect(weapons[1]?.element).toEqual({ type: 'poison', value: 20 })
    expect(weapons[2]).not.toHaveProperty('element')
  })

  it('装飾品は allowed_on と level を写し、生産護石は全ランクで鑑定護石を含めない（4）', () => {
    const { bundle } = run()
    expect(bundle.decorations[0]).toEqual({
      id: 'dc:1',
      target: 'armor',
      slotLevel: 3,
      skills: [{ skillId: 'sk:100', level: 1 }],
    })
    expect(bundle.charms).toEqual([
      { id: 'ch:5:1', rarity: 3, skills: [{ skillId: 'sk:100', level: 1 }], slots: [] },
      { id: 'ch:5:2', rarity: 4, skills: [{ skillId: 'sk:100', level: 2 }], slots: [] },
    ])
  })

  it('シリーズ／グループの発動部位数を防具セットから作る', () => {
    const { bundle, mismatches } = run()
    expect(bundle.setBonuses[0]).toEqual({
      id: 'sb:200',
      skillId: 'sk:200',
      thresholds: [
        { pieces: 2, level: 1 },
        { pieces: 4, level: 2 },
      ],
    })
    expect(mismatches).toEqual([])
  })

  it('防具セットの間で発動部位数が違えば不一致として持つ', () => {
    const input = makeInput()
    const second = input.armors[1]
    if (second?.set_bonus) second.set_bonus.ranks = [{ pieces: 3, skill_level: 1 }]
    const { mismatches } = run(input)
    expect(mismatches).toHaveLength(1)
    expect(mismatches[0]?.id).toBe('sb:200')
    expect(mismatches[0]?.byArmorSet.map((e) => e.armorSetGameId)).toEqual([10, 11])
  })

  it('型の前提を外れたときは ID を示して失敗する', () => {
    const level2 = makeInput()
    const piece = level2.armors[0]?.pieces[0]
    if (piece) piece.skills = { '200': 2 }
    expect(() => run(level2)).toThrow(/ar:10:head.*sk:200.*レベルが 1 ではありません/)

    const twoSpecials = makeInput()
    const weapon = twoSpecials.weapons[0]
    if (weapon) weapon.specials.push({ kind: 'element', element: 'ice', raw: 1, hidden: false })
    expect(() => run(twoSpecials)).toThrow(/wp:charge-blade:22.*specials が 2 個/)

    const hidden = makeInput()
    const hiddenSpecial = hidden.weapons[1]?.specials[0]
    if (hiddenSpecial) hiddenSpecial.hidden = true
    expect(() => run(hidden)).toThrow(/wp:bow:3.*hidden/)

    const withBonus = makeInput()
    const bonusWeapon = withBonus.weapons[2]
    if (bonusWeapon) bonusWeapon.skills = { '201': 1 }
    expect(() => run(withBonus)).toThrow(/wp:bow:4.*sk:201/)

    const badKind = makeInput()
    const skill = badKind.skills[0]
    if (skill) skill.kind = 'unknown'
    expect(() => run(badKind)).toThrow(/sk:100.*未知の kind/)

    const badPart = makeInput()
    const badPiece = badPart.armors[0]?.pieces[0]
    if (badPiece) badPiece.kind = 'tail'
    expect(() => run(badPart)).toThrow(/ar:10:tail.*部位/)

    const noRanks = makeInput()
    const emptySkill = noRanks.skills[1]
    if (emptySkill) emptySkill.ranks = []
    expect(() => run(noRanks)).toThrow(/sk:101.*ranks が空/)
  })
})

describe('防具のランク（受入基準 12）', () => {
  it.each([
    [1, 'low'],
    [2, 'low'],
    [3, 'low'],
    [4, 'low'],
    [5, 'high'],
    [6, 'high'],
    [7, 'high'],
    [8, 'high'],
  ])('レア度 %i は %s を付ける（12）', (rarity, rank) => {
    const input = makeInput()
    const set = input.armors[0]
    if (set) set.rarity = rarity
    expect(run(input).bundle.armors[0]?.rank).toBe(rank)
  })

  it.each([0, 9])('対応表に無いレア度 %i では防具 ID を示して失敗する（12）', (rarity) => {
    const input = makeInput()
    const set = input.armors[0]
    if (set) set.rarity = rarity
    expect(() => run(input)).toThrow(`ar:10:head: レア度 ${rarity} のランクが対応表にありません`)
  })
})

describe('辞書（受入基準 5）', () => {
  it('ja・en だけを出し、スキルはレベルごとの説明文を Lv1 から並べる', () => {
    const { dictionaries } = run()
    expect(Object.keys(dictionaries)).toEqual(['ja', 'en'])
    expect(dictionaries.ja.locale).toBe('ja')
    expect(dictionaries.en.version).toBe('9.9.9')
    expect(dictionaries.ja.entries['sk:100']).toEqual({
      name: '攻撃',
      description: '攻撃が上がる',
      levelDescriptions: ['小', '中'],
    })
    expect(dictionaries.en.entries['sk:100']?.levelDescriptions).toEqual(['low', 'mid'])
    const serialized = JSON.stringify(dictionaries)
    expect(serialized).not.toContain('-fr')
  })

  it('sb: は元のスキルの名前を持ち、防具・装飾品・武器・生産護石の名前を持つ', () => {
    const { ja, en } = run().dictionaries
    expect(ja.entries['sb:200']).toEqual({ name: 'シリーズ' })
    expect(en.entries['ar:10:head']).toEqual({ name: 'head10', description: 'head desc 10' })
    expect(ja.entries['dc:1']?.name).toBe('珠')
    expect(en.entries['wp:charge-blade:22']?.name).toBe('Blade')
    expect(ja.entries['ch:5:2']?.name).toBe('護石II')
    expect(ja.entries['ch:6:1']).toBeUndefined()
  })

  it('MasterBundle に名前と説明文を入れない', () => {
    const text = JSON.stringify(run().bundle)
    expect(text).not.toContain('攻撃')
    expect(text).not.toContain('levelDescriptions')
  })

  it('翻訳が無い言語は空の名前になる（検証が拾う）', () => {
    const input = makeInput()
    const skill = input.skills[1]
    if (skill) skill.names = { ja: 'のみ' }
    expect(run(input).dictionaries.en.entries['sk:101']?.name).toBe('')
  })
})
