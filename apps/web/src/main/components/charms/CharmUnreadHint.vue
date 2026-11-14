<script setup lang="ts">
import { TriangleAlert } from '@lucide/vue'

defineProps<{ id: string }>()
</script>

<template>
  <p :id="id" class="text-muted-foreground flex items-center gap-1 text-sm">
    <TriangleAlert class="size-4 shrink-0" aria-hidden="true" />
    読み取れませんでした。画像を見て選んでください。
  </p>
</template>
