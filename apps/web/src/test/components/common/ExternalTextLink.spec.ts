import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ExternalTextLink from '@/components/common/ExternalTextLink.vue'

// 030 受入基準 外部リンク（新しいタブで開く・読み上げ）を共有部品として検証する
describe('ExternalTextLink', () => {
  let wrapper: ReturnType<typeof mount> | null = null

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  const mountLink = () =>
    mount(ExternalTextLink, {
      props: { href: 'https://example.com/x' },
      slots: { default: 'リンク文言' },
    })

  it('href を渡し、新しいタブで開く属性（target・rel）を付ける', () => {
    wrapper = mountLink()
    const a = wrapper.get('a')
    expect(a.attributes('href')).toBe('https://example.com/x')
    expect(a.attributes('target')).toBe('_blank')
    expect(a.attributes('rel')).toBe('noopener noreferrer')
    expect(a.classes()).toContain('underline')
  })

  it('スロットの文言を出し、アイコンは読み上げず、「（新しいタブで開く）」を sr-only で添える', () => {
    wrapper = mountLink()
    const a = wrapper.get('a')
    expect(a.text()).toBe('リンク文言（新しいタブで開く）')
    expect(a.get('svg').attributes('aria-hidden')).toBe('true')
    const sr = a.get('span')
    expect(sr.classes()).toContain('sr-only')
    expect(sr.text()).toBe('（新しいタブで開く）')
  })
})
