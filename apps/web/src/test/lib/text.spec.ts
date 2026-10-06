import { describe, expect, it } from 'vitest'
import { compareJa, matchesQuery, normalizeForSearch } from '@/lib/text'

// 受入基準 3・4（名前の絞り込み）
describe('text', () => {
  it('全角・半角と大文字・小文字をそろえる', () => {
    expect(normalizeForSearch('ＡＢＣ１２３')).toBe('abc123')
    expect(normalizeForSearch('ｱｲｳ')).toBe('アイウ')
  })

  it('空の語・空白だけの語はすべてに一致する', () => {
    expect(matchesQuery('鉄の大剣', '')).toBe(true)
    expect(matchesQuery('鉄の大剣', '  ')).toBe(true)
  })

  it('部分一致する（全角半角・大文字小文字を区別しない）', () => {
    expect(matchesQuery('鉄の大剣', '大剣')).toBe(true)
    expect(matchesQuery('Iron Sword', 'iron')).toBe(true)
    expect(matchesQuery('攻撃珠【２】', '【2】')).toBe(true)
    expect(matchesQuery('鉄の大剣', '太刀')).toBe(false)
  })

  it('compareJa は日本語の順で比べる', () => {
    expect(['う', 'あ', 'い'].sort(compareJa)).toEqual(['あ', 'い', 'う'])
  })
})
