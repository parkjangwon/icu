<script setup lang="ts">
import { computed, defineProps } from 'vue';
import { Card, CardContent } from '@/components/ui/card';

const props = defineProps<{
  healthChecks: Array<{ is_success: boolean, check_time: string }>;
}>();

const latestCheck = computed(() => {
  if (!props.healthChecks || props.healthChecks.length === 0) {
    return null;
  }
  return props.healthChecks[0];
});

const status = computed(() => {
  if (!latestCheck.value) return { text: 'Unknown', color: 'gray' };
  return latestCheck.value.is_success
    ? { text: 'UP', color: 'green' }
    : { text: 'DOWN', color: 'red' };
});

const lastChecked = computed(() => {
  if (!latestCheck.value) return 'N/A';
  const date = new Date(latestCheck.value.check_time);
  return date.toLocaleString();
});
</script>

<template>
  <Card 
    :class="{
      'bg-green-500': status.color === 'green',
      'bg-red-500': status.color === 'red',
      'bg-gray-500': status.color === 'gray',
    }"
  >
    <CardContent class="p-6 text-center text-white">
      <p class="text-5xl font-bold">{{ status.text }}</p>
      <p class="mt-2 text-sm opacity-90">Last checked: {{ lastChecked }}</p>
    </CardContent>
  </Card>
</template>
