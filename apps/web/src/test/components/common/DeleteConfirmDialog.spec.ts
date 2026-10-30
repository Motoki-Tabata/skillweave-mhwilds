import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DeleteConfirmDialog from '@/components/common/DeleteConfirmDialog.vue'
import { flushPromises, installDomPolyfills, textOf } from '../../support/mount'

// 011 AC-6（削除の確認。タイトルと本文は呼び出し側が渡す）
describe('DeleteConfirmDialog', () => {
  beforeAll(installDomPolyfills)
  let wrapper: ReturnType<typeof mount> | null = null
  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ''
  })

  const open = async () => {
    wrapper = mount(DeleteConfirmDialog, {
      props: { open: true, title: '構成を削除しますか？', description: '「A」を削除します。' },
      attachTo: document.body,
    })
    await flushPromises()
  }
  const button = (text: string) =>
    Array.from(document.querySelectorAll('button')).find((b) => textOf(b) === text)!

  it('渡されたタイトルと本文を出し、開いたらフォーカスを「キャンセル」に置く', async () => {
    await open()
    const dialog = document.querySelector('[role="alertdialog"]')
    expect(textOf(dialog)).toContain('構成を削除しますか？')
    expect(textOf(dialog)).toContain('「A」を削除します。')
    await vi.waitFor(() => expect(document.activeElement).toBe(button('キャンセル')))
  })

  // 012 AC-9（取り消しの確認は確定のボタンの文言を差し替える）
  it('confirmLabel を渡すと確定のボタンの文言を替え、渡さなければ「削除」', async () => {
    await open()
    expect(button('削除')).toBeDefined()
    wrapper!.unmount()
    document.body.innerHTML = ''
    wrapper = mount(DeleteConfirmDialog, {
      props: { open: true, title: 't', description: 'd', confirmLabel: '共有を取り消す' },
      attachTo: document.body,
    })
    await flushPromises()
    expect(button('共有を取り消す')).toBeDefined()
    expect(Array.from(document.querySelectorAll('button')).some((b) => textOf(b) === '削除')).toBe(
      false,
    )
  })

  // 026 AC-4（オーバーレイの黒は 60%）
  it('オーバーレイは bg-black/60 で、80 ではない', async () => {
    await open()
    expect(document.querySelector('.bg-black\\/60')).not.toBeNull()
    expect(document.querySelector('.bg-black\\/80')).toBeNull()
  })

  it('「削除」で confirm を、「キャンセル」で open の更新（false）を出す', async () => {
    await open()
    button('削除').click()
    await flushPromises()
    expect(wrapper!.emitted('confirm')).toHaveLength(1)
    button('キャンセル').click()
    await flushPromises()
    expect(wrapper!.emitted('update:open')?.at(-1)).toEqual([false])
  })
})
