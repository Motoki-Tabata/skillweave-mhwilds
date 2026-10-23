import { ref } from 'vue'
import { defineStore } from 'pinia'

/** 通知の見た目。`destructive` は書き込みの失敗など、操作が通らなかったとき。 */
export type ToastTone = 'default' | 'destructive'

export interface ToastItem {
  id: number
  message: string
  tone: ToastTone
}

/** 画面の右上に数秒だけ出す通知（操作の結果）。 */
export const useToastStore = defineStore('toast', () => {
  const items = ref<ToastItem[]>([])
  let nextId = 1

  function push(message: string, tone: ToastTone = 'default'): void {
    items.value = [...items.value, { id: nextId++, message, tone }]
  }

  function dismiss(id: number): void {
    items.value = items.value.filter((item) => item.id !== id)
  }

  return { items, push, dismiss }
})
