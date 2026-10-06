import { ref } from 'vue'
import { defineStore } from 'pinia'

export interface ToastItem {
  id: number
  message: string
}

/** 画面の右上に数秒だけ出す通知（操作の結果）。 */
export const useToastStore = defineStore('toast', () => {
  const items = ref<ToastItem[]>([])
  let nextId = 1

  function push(message: string): void {
    items.value = [...items.value, { id: nextId++, message }]
  }

  function dismiss(id: number): void {
    items.value = items.value.filter((item) => item.id !== id)
  }

  return { items, push, dismiss }
})
