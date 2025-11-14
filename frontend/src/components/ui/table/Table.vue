<script setup lang="ts">
import { cn } from '@/lib/utils'
</script>

<template>
  <div class="w-full overflow-auto">
    <table :class="cn('w-full caption-bottom text-sm', $attrs.class ?? '')">
      <slot />
    </table>
  </div>
</template>
