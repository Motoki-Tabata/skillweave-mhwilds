import { copyToClipboard } from '@/lib/shares/url'
import { useToastStore } from '@/stores/toast'

const COPIED = 'URL をコピーしました。'
const COPY_FAILED = 'URL をコピーできませんでした。URL を選択してコピーしてください。'

/** 要素の文字を全選択する（コピーに失敗したとき、利用者が手でコピーできるようにする）。 */
export function selectAllText(element: HTMLElement | null): void {
  if (element === null) return
  const selection = globalThis.getSelection()
  if (selection === null) return
  const range = document.createRange()
  range.selectNodeContents(element)
  selection.removeAllRanges()
  selection.addRange(range)
}

/** URL をコピーし、結果をトーストで知らせる。失敗したら `urlElement` の文字を全選択する。 */
export async function copyUrlWithToast(url: string, urlElement: HTMLElement | null): Promise<void> {
  const toast = useToastStore()
  if (await copyToClipboard(url)) {
    toast.push(COPIED)
    return
  }
  toast.push(COPY_FAILED, 'destructive')
  selectAllText(urlElement)
}
