<script setup lang="ts">
import { computed } from 'vue'
import { CircleX, Info, TriangleAlert } from '@lucide/vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

const props = defineProps<{
  tone: 'info' | 'warning' | 'error'
  title?: string
}>()

// 色だけで伝えない: 形の違うアイコンと文言を必ず併記する
const icon = computed(() => {
  if (props.tone === 'error') return CircleX
  if (props.tone === 'warning') return TriangleAlert
  return Info
})

const alertClass = computed(() => {
  if (props.tone === 'error') return 'border-destructive'
  // 警告は文字色を変えず、左の太線と薄い背景で示す
  if (props.tone === 'warning')
    return 'border-l-warning border-l-[3px] bg-warning/15 text-foreground'
  return ''
})
</script>

<template>
  <Alert :variant="tone === 'error' ? 'destructive' : 'default'" :class="alertClass">
    <component :is="icon" aria-hidden="true" />
    <AlertTitle v-if="title" class="line-clamp-none">{{ title }}</AlertTitle>
    <AlertDescription :class="tone === 'warning' ? 'text-foreground' : ''">
      <slot />
    </AlertDescription>
  </Alert>
</template>
