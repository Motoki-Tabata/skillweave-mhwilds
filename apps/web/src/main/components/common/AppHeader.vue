<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
</script>

<template>
  <header
    class="bg-background sticky top-0 z-40 flex h-12 items-center gap-2 border-b px-4 md:px-6"
  >
    <span class="text-base font-bold">SkillWeave</span>
    <Badge variant="outline">非公式の二次創作</Badge>
    <!-- 将来の認証導線を1か所にまとめるための空き（009） -->
    <div class="ml-auto" data-slot="header-auth" />
  </header>
</template>
