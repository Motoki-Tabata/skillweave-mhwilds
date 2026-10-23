import { describe, expect, it } from 'vitest'
import { compareJa, matchesQuery, matchesSkillQuery, normalizeForSearch } from '@/lib/text'

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

// 受入基準 2（スキル名の検索）
describe('matchesSkillQuery', () => {
  it('名前の部分一致', () => {
    expect(matchesSkillQuery('攻撃', 'こうげき', '攻')).toBe(true)
    expect(matchesSkillQuery('攻撃', 'こうげき', '防')).toBe(false)
  })

  it('読みの部分一致', () => {
    expect(matchesSkillQuery('攻撃', 'こうげき', 'うげ')).toBe(true)
  })

  it('カタカナ・半角カタカナの入力をひらがなの読みに一致させる', () => {
    expect(matchesSkillQuery('攻撃', 'こうげき', 'コウゲキ')).toBe(true)
    expect(matchesSkillQuery('攻撃', 'こうげき', 'ｺｳｹﾞｷ')).toBe(true)
  })

  it('名前がカタカナのスキルをひらがなで検索できる', () => {
    expect(matchesSkillQuery('ガード強化', 'がーどきょうか', 'がーど')).toBe(true)
    expect(matchesSkillQuery('ガード強化', undefined, 'がーど')).toBe(true)
  })

  it('全角の英数字と半角を同一視する', () => {
    expect(matchesSkillQuery('Ａ攻撃2', undefined, 'a攻撃２')).toBe(true)
  })

  it('読みが無いスキルは名前だけで照らす', () => {
    expect(matchesSkillQuery('攻撃', undefined, 'こうげき')).toBe(false)
  })

  it('空の語はすべてに一致する', () => {
    expect(matchesSkillQuery('攻撃', undefined, '  ')).toBe(true)
  })
})
