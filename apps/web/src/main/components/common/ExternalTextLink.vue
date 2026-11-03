<script setup lang="ts">
import { ExternalLink } from '@lucide/vue'

/** 文中に置く、新しいタブで開く外部リンク。リンクの文言はスロットで渡す。 */
export interface Props {
  href: string
}

defineProps<Props>()
</script>

<template>
  <a :href="href" target="_blank" rel="noopener noreferrer" class="underline"
    ><slot /><ExternalLink
      class="ml-0.5 inline size-3.5 align-text-bottom"
      aria-hidden="true"
    /><span class="sr-only">（新しいタブで開く）</span></a
  >
</template>
