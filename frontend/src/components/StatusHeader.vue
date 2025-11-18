<script setup lang="ts">
import { computed, defineProps } from 'vue';
import { Card, CardContent } from '@/components/ui/card';

const props = defineProps<{
  healthChecks: Array<{ isSuccess: boolean, checkTime: string }>;
}>();

const latestCheck = computed(() => {
  if (!props.healthChecks || props.healthChecks.length === 0) {
    return null;
  }
  return props.healthChecks[0];
});

const status = computed(() => {
  if (!latestCheck.value) return { text: 'Unknown' };
  return latestCheck.value.isSuccess
    ? { text: 'UP' }
    : { text: 'DOWN' };
});

const lastChecked = computed(() => {
  if (!latestCheck.value) return 'N/A';
  const date = new Date(latestCheck.value.checkTime);
  return date.toLocaleString();
});
</script>

<template>
  <Card>
    <CardContent class="p-6 text-center text-black">
      <p class="text-5xl font-bold">{{ status.text }}</p>
      <p class="mt-2 text-sm opacity-90">Last checked: {{ lastChecked }}</p>
    </CardContent>
  </Card>
</template>
