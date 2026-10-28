import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BuildDialogFrame from '@/components/builds/BuildDialogFrame.vue'
import PickerDialog from '@/components/search/PickerDialog.vue'
import { flushPromises, installDomPolyfills } from '../../support/mount'

const OVERLAY_CLASS =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-x-0 top-12 bottom-8 z-50 bg-black/60 md:inset-y-0'

// 025 AC-3（オーバーレイは1つの部品。位置・色・アニメーションのクラスを変えない）
describe('AppDialogOverlay', () => {
  beforeAll(installDomPolyfills)
  let wrapper: ReturnType<typeof mount> | null = null
  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ''
  })

  const overlayClass = () => document.querySelector('[data-state="open"].bg-black\\/60')?.className

  it('PickerDialog のオーバーレイは、いまと同じクラスである', async () => {
    wrapper = mount(PickerDialog, {
      props: { open: true, title: 't', description: 'd' },
      attachTo: document.body,
    })
    await flushPromises()
    expect(overlayClass()).toBe(OVERLAY_CLASS)
  })

  it('BuildDialogFrame のオーバーレイは、いまと同じクラスである', async () => {
    wrapper = mount(BuildDialogFrame, {
      props: { open: true, title: 't', description: 'd' },
      attachTo: document.body,
    })
    await flushPromises()
    expect(overlayClass()).toBe(OVERLAY_CLASS)
  })
})
