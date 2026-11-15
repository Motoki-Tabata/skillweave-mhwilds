import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useToastStore } from '@/stores/toast'

/**
 * 新しい版の通知の状態（018 D10）。通知を出すのは「待っている かつ 閉じていない」とき。
 * 閉じた状態はメモリだけに持つ（次にアプリを開いたとき、まだ待っていればまた出す）。
 * `navigator` には触れず、再読み込みの送信は `register.ts` が登録した関数へ任せる。
 */
export const useAppUpdateStore = defineStore('appUpdate', () => {
  const waiting = ref(false)
  const dismissed = ref(false)
  const reloading = ref(false)
  /** 通知が出た時点で、並びの上にあった最後のトーストの id（0 は無し）。トーストと出た順に並べるため。 */
  const afterToastId = ref(0)
  let reloadHandler: (() => void) | null = null

  const visible = computed(() => waiting.value && !dismissed.value)

  function setWaiting(): void {
    if (waiting.value) return
    afterToastId.value = useToastStore().items.at(-1)?.id ?? 0
    waiting.value = true
  }

  function dismiss(): void {
    dismissed.value = true
  }

  function setReloadHandler(handler: () => void): void {
    reloadHandler = handler
  }

  function reload(): void {
    if (reloading.value) return
    reloading.value = true
    reloadHandler?.()
  }

  return {
    waiting,
    dismissed,
    reloading,
    afterToastId,
    visible,
    setWaiting,
    dismiss,
    setReloadHandler,
    reload,
  }
})
