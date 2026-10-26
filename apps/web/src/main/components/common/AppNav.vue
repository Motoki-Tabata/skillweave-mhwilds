<script setup lang="ts">
import { RouterLink } from 'vue-router'

const LINKS = [
  { to: '/', label: '装備検索' },
  { to: '/charms', label: '護石' },
  { to: '/weapons', label: '個体差のある武器' },
] as const
</script>

<template>
  <nav aria-label="画面の切り替え" class="border-b">
    <ul class="mx-auto flex w-full gap-2 px-4 md:max-w-[720px] md:px-6 lg:max-w-[1280px]">
      <li v-for="link in LINKS" :key="link.to" class="flex">
        <RouterLink
          :to="link.to"
          class="focus-visible:ring-ring/50 flex h-11 items-center border-b-[3px] border-transparent px-3 text-sm outline-none focus-visible:ring-3 aria-[current=page]:border-primary aria-[current=page]:font-bold"
        >
          {{ link.label }}
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>
