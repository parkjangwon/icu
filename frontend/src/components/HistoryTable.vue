<script setup lang="ts">
import { computed, defineProps } from 'vue';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface HealthCheck {
  is_success: boolean;
  check_time: string;
  status_code: number | null;
  response_time_ms: number | null;
}

const props = defineProps<{
  healthChecks: HealthCheck[];
}>();

const recentChecks = computed(() => {
  return (props.healthChecks || []).slice(0, 10);
});

const formatTime = (time: string) => {
  return new Date(time).toLocaleString();
};
</script>

<template>
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Status</TableHead>
        <TableHead>Response Time</TableHead>
        <TableHead>Status Code</TableHead>
        <TableHead>Checked At</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow v-if="recentChecks.length === 0">
        <TableCell :colspan="4" class="text-center text-gray-500">
          No health check data available yet.
        </TableCell>
      </TableRow>
      <TableRow v-for="(check, index) in recentChecks" :key="index">
        <TableCell>
          <Badge :class="check.is_success ? 'bg-black text-white' : 'bg-gray-400 text-white'">
            {{ check.is_success ? 'UP' : 'DOWN' }}
          </Badge>
        </TableCell>
        <TableCell>{{ check.response_time_ms }}ms</TableCell>
        <TableCell>{{ check.status_code || 'N/A' }}</TableCell>
        <TableCell>{{ formatTime(check.check_time) }}</TableCell>
      </TableRow>
    </TableBody>
  </Table>
</template>
