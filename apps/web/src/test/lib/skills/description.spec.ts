import { describe, expect, it } from 'vitest'
import { levelDescription } from '@/lib/skills/description'

// 受入基準 7・10（説明文の取り出し。無いときは null）
describe('levelDescription', () => {
  const entry = { name: 'x', levelDescriptions: ['一', '二\r\n三', ''] }

  it('index 0 = Lv1 で取り出し、改行を \\n にそろえる', () => {
    expect(levelDescription(entry, 1)).toBe('一')
    expect(levelDescription(entry, 2)).toBe('二\n三')
  })

  it('空文字・範囲外・辞書の欠けは null', () => {
    expect(levelDescription(entry, 3)).toBeNull()
    expect(levelDescription(entry, 4)).toBeNull()
    expect(levelDescription({ name: 'x' }, 1)).toBeNull()
    expect(levelDescription(undefined, 1)).toBeNull()
  })
})
