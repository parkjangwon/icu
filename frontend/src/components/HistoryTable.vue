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
  isSuccess: boolean;
  checkTime: string;
  statusCode: number | null;
  responseTimeMs: number | null;
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
          <Badge :class="check.isSuccess ? 'bg-black text-white' : 'bg-gray-400 text-white'">
            {{ check.isSuccess ? 'UP' : 'DOWN' }}
          </Badge>
        </TableCell>
        <TableCell>{{ check.responseTimeMs }}ms</TableCell>
        <TableCell>{{ check.statusCode || 'N/A' }}</TableCell>
        <TableCell>{{ formatTime(check.checkTime) }}</TableCell>
      </TableRow>
    </TableBody>
  </Table>
</template>
