import { onBeforeUnmount, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { LOADING_SKELETON_DELAY_MS } from '@/constants/search'

/** 読み込みが 300ms 未満で終わるときはスケルトンを出さない（ちらつきを避ける）。 */
export function useSkeletonDelay(loading: () => boolean): Ref<boolean> {
  const show = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  function clear(): void {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }

  watch(
    loading,
    (isLoading) => {
      clear()
      show.value = false
      if (!isLoading) return
      timer = setTimeout(() => {
        show.value = true
      }, LOADING_SKELETON_DELAY_MS)
    },
    { immediate: true },
  )
  onBeforeUnmount(clear)
  return show
}
