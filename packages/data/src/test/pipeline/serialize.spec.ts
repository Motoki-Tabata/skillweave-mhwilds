import { describe, expect, it } from 'vitest'
import type { MasterBundle } from '../../main/index.ts'
import { convert } from '../../main/pipeline/convert.ts'
import { serializeBundle, serializeDictionary } from '../../main/pipeline/serialize.ts'
import { CONFIG, makeInput } from '../support/fixtures.ts'

const reversedInput = () => {
  const input = makeInput()
  return {
    skills: [...input.skills].reverse(),
    armors: [...input.armors].reverse(),
    accessories: [...input.accessories].reverse(),
    amulets: [...input.amulets].reverse(),
    weapons: [...input.weapons].reverse(),
  }
}

describe('直列化（受入基準 10）', () => {
  it('入力の順序を入れ替えても同じバイト列になる', () => {
    const a = convert(makeInput(), CONFIG)
    const b = convert(reversedInput(), CONFIG)
    expect(serializeBundle(b.bundle)).toBe(serializeBundle(a.bundle))
    expect(serializeDictionary(b.dictionaries.ja)).toBe(serializeDictionary(a.dictionaries.ja))
    expect(serializeDictionary(b.dictionaries.en)).toBe(serializeDictionary(a.dictionaries.en))
  })

  it('インデント2・末尾に改行1つ・キーは昇順', () => {
    const text = serializeBundle(convert(makeInput(), CONFIG).bundle)
    expect(text.endsWith('}\n')).toBe(true)
    expect(text.endsWith('\n\n')).toBe(false)
    expect(text.startsWith('{\n  "appraisedCharm"')).toBe(true)
    const top = Object.keys(JSON.parse(text) as object)
    expect(top).toEqual([...top].sort())
  })

  it('集合は id、skills は skillId、setBonusIds は昇順、thresholds は pieces の昇順にする', () => {
    const { bundle } = convert(makeInput(), CONFIG)
    const shuffled: MasterBundle = structuredClone(bundle)
    shuffled.setBonuses[0]?.thresholds.reverse()
    const armor = shuffled.armors[0]
    if (armor) {
      armor.setBonusIds.reverse()
      armor.skills = [
        { skillId: 'sk:201' as never, level: 1 },
        { skillId: 'sk:100' as never, level: 1 },
      ]
    }
    const parsed = JSON.parse(serializeBundle(shuffled)) as MasterBundle
    expect(parsed.setBonuses[0]?.thresholds.map((t) => t.pieces)).toEqual([2, 4])
    const sorted = parsed.armors.find((a) => a.id === 'ar:10:head')
    expect(sorted?.setBonusIds).toEqual(['sb:200', 'sb:201'])
    expect(sorted?.skills.map((s) => s.skillId)).toEqual(['sk:100', 'sk:201'])
    expect(parsed.skills.map((s) => s.id)).toEqual(['sk:100', 'sk:101', 'sk:200', 'sk:201'])
  })

  it('スロットの順は入力のまま、文字列はコードユニット順で比べる', () => {
    const { bundle } = convert(makeInput(), CONFIG)
    const parsed = JSON.parse(serializeBundle(bundle)) as MasterBundle
    expect(parsed.armors.find((a) => a.id === 'ar:10:head')?.slots.map((s) => s.level)).toEqual([
      1, 3,
    ])
    const ids = ['B', 'a', 'Z'].map((id) => ({ ...bundle.decorations[0]!, id: id as never }))
    const out = JSON.parse(serializeBundle({ ...bundle, decorations: ids })) as MasterBundle
    expect(out.decorations.map((d) => d.id)).toEqual(['B', 'Z', 'a'])
  })
})
