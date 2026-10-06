import { describe, expect, it } from 'vitest'
import { useToastStore } from '@/stores/toast'
import { newPinia } from '../support/mount'

describe('toast ストア', () => {
  it('通知を追加し、id で消す', () => {
    const toast = useToastStore(newPinia())
    toast.push('a')
    toast.push('b')
    expect(toast.items.map((i) => i.message)).toEqual(['a', 'b'])
    toast.dismiss(toast.items[0].id)
    expect(toast.items.map((i) => i.message)).toEqual(['b'])
  })
})
