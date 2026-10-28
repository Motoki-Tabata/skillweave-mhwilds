<script setup lang="ts">
import { DialogOverlay } from 'reka-ui'
</script>

<template>
  <!-- 基準幅では、ヘッダー（48px）とクレジットのバー（32px）を覆わない -->
  <DialogOverlay
    class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-x-0 top-12 bottom-8 z-50 bg-black/60 md:inset-y-0"
  />
</template>
