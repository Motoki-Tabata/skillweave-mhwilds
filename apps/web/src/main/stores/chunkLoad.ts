import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useAppUpdateStore } from '@/stores/appUpdate'
import { useToastStore } from '@/stores/toast'

/**
 * 画面の部品の読み込み失敗の通知の状態（039 D6）。
 * 閉じるまで出し続け、出ている間に再び失敗したら行き先だけ差し替える。
 * 再読み込みは、失敗した移動の行き先へ `location.assign` で移る。
 */
export const useChunkLoadStore = defineStore('chunkLoad', () => {
  const visible = ref(false)
  const targetHref = ref('/')
  const reloading = ref(false)
  /** 通知が出た時点で、並びの上にあった最後のトーストの id（0 は無し）。 */
  const afterToastId = ref(0)
  /** 通知が出た時点で、新しい版の通知が出ていたか。 */
  const afterUpdate = ref(false)
  let navigateHandler: (href: string) => void = (href) => window.location.assign(href)

  function report(href: string): void {
    if (visible.value) {
      targetHref.value = href
      return
    }
    afterToastId.value = useToastStore().items.at(-1)?.id ?? 0
    afterUpdate.value = useAppUpdateStore().visible
    targetHref.value = href
    reloading.value = false
    visible.value = true
  }

  function dismiss(): void {
    visible.value = false
  }

  function setNavigateHandler(handler: (href: string) => void): void {
    navigateHandler = handler
  }

  function reload(): void {
    if (reloading.value) return
    reloading.value = true
    navigateHandler(targetHref.value)
  }

  return {
    visible,
    targetHref,
    reloading,
    afterToastId,
    afterUpdate,
    report,
    dismiss,
    setNavigateHandler,
    reload,
  }
})
