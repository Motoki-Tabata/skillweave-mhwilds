import { describe, expect, it } from 'vitest'
import { buttonVariants } from '@/components/ui/button'

// 026 AC-5（outline は透明背景・input 色の枠・muted のホバー）
describe('buttonVariants outline', () => {
  const cls = buttonVariants({ variant: 'outline' }).split(/\s+/)

  it('透明背景に input 色の枠を持つ', () => {
    expect(cls).toEqual(expect.arrayContaining(['border', 'border-input', 'bg-transparent']))
    expect(cls).not.toContain('bg-background')
  })

  it('ホバーは muted の背景', () => {
    expect(cls).toContain('hover:bg-muted')
    expect(cls).not.toContain('hover:bg-accent')
  })
})
