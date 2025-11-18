<script setup lang="ts">
import { defineProps, computed } from 'vue';
import { Line } from 'vue-chartjs';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  type ChartOptions,
  type Scale,
} from 'chart.js';
import 'chart.js/auto'; // Using auto imports all the necessary components

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
);

interface HealthCheck {
  checkTime: string;
  responseTimeMs: number | null;
}

const props = defineProps<{
  healthChecks: HealthCheck[];
}>();

const chartData = computed(() => {
  const labels = (props.healthChecks || []).map(check => new Date(check.checkTime).toLocaleTimeString()).reverse();
  const data = (props.healthChecks || []).map(check => check.responseTimeMs).reverse();
  
  return {
    labels,
    datasets: [
      {
        label: 'Response Time (ms)',
        backgroundColor: 'rgba(0, 0, 0, 0.1)',
        borderColor: 'rgba(0, 0, 0, 1)',
        data,
        fill: true,
        tension: 0.4,
      },
    ],
  };
});

const chartOptions = computed<ChartOptions<'line'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    y: {
      type: 'linear',
      beginAtZero: true,
      ticks: {
        callback(this: Scale, tickValue: number | string) {
          const v = typeof tickValue === 'string' ? Number(tickValue) : tickValue;
          return `${v} ms`;
        },
      },
    },
  },
  plugins: {
    legend: {
      display: false,
    },
  },
}));

</script>

<template>
  <div class="h-64">
    <Line v-if="healthChecks && healthChecks.length" :data="chartData" :options="chartOptions" />
    <div v-else class="flex items-center justify-center h-full text-gray-500">
      Not enough data to display a chart.
    </div>
  </div>
</template>
