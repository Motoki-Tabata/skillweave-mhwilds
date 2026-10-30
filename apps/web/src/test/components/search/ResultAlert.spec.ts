import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ResultAlert from '@/components/search/ResultAlert.vue'

// 026 AC-7（警告は左の太線と薄い背景で示す。info・error は変えない）
describe('ResultAlert', () => {
  const mountTone = (tone: 'info' | 'warning' | 'error') =>
    mount(ResultAlert, { props: { tone }, slots: { default: '本文' } })

  it('warning は左の太線（3px）と薄い背景を持つ', () => {
    const cls = mountTone('warning').find('[role="alert"]').classes()
    expect(cls).toContain('border')
    expect(cls).toContain('border-l-warning')
    expect(cls).toContain('border-l-[3px]')
    expect(cls).toContain('bg-warning/15')
  })

  it('info と error は左の太線を持たない', () => {
    for (const tone of ['info', 'error'] as const) {
      const cls = mountTone(tone).find('[role="alert"]').classes()
      expect(cls).not.toContain('border-l-[3px]')
      expect(cls).not.toContain('border-l-warning')
    }
  })

  it('error は destructive の枠線のまま', () => {
    expect(mountTone('error').find('[role="alert"]').classes()).toContain('border-destructive')
  })
})
