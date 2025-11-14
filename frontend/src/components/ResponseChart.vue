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
  check_time: string;
  response_time_ms: number | null;
}

const props = defineProps<{
  healthChecks: HealthCheck[];
}>();

const chartData = computed(() => {
  const labels = (props.healthChecks || []).map(check => new Date(check.check_time).toLocaleTimeString()).reverse();
  const data = (props.healthChecks || []).map(check => check.response_time_ms).reverse();
  
  return {
    labels,
    datasets: [
      {
        label: 'Response Time (ms)',
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
        borderColor: 'rgba(59, 130, 246, 1)',
        data,
        fill: true,
        tension: 0.4,
      },
    ],
  };
});

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    y: {
      beginAtZero: true,
      ticks: {
        callback: (value: number) => `${value} ms`,
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
