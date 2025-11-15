<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import { useSupabaseClient } from '@/composables/useSupabaseClient';

import StatusHeader from '@/components/StatusHeader.vue';
import ResponseChart from '@/components/ResponseChart.vue';
import HistoryTable from '@/components/HistoryTable.vue';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const route = useRoute();
const router = useRouter();
const supabase = useSupabaseClient();
const uniqueId = route.params.uniqueId as string;

const monitorData = ref<any>(null);
const isLoading = ref(true);
const errorMessage = ref('');
const accessToken = ref<string | null>(null);
let refreshTimer: number | undefined;

const fetchMonitorData = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/login');
      return;
    }
    accessToken.value = session.access_token;

    const response = await axios.get(`/api/monitor/${uniqueId}`, {
      headers: { Authorization: `Bearer ${accessToken.value}` },
    });
    monitorData.value = response.data;
  } catch (error: any) {
    errorMessage.value = error.response?.data?.error || 'Could not fetch monitoring data.';
    // Stop refreshing on error to avoid spamming
    if (refreshTimer) clearInterval(refreshTimer);
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => {
  fetchMonitorData();
  // Refresh data every 10 seconds
  refreshTimer = window.setInterval(fetchMonitorData, 10000);
});

onBeforeUnmount(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
});
</script>

<template>
  <div class="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
    <div v-if="isLoading" class="text-center py-20">
      <p class="text-lg text-gray-500">Loading monitoring data...</p>
    </div>
    <div v-else-if="errorMessage" class="text-center p-6 bg-red-100 rounded-lg shadow-md">
      <p class="text-red-600 font-semibold">{{ errorMessage }}</p>
      <router-link to="/" class="mt-4 inline-block text-blue-500 hover:underline">Go back home</router-link>
    </div>
    <div v-else-if="monitorData" class="space-y-6 sm:space-y-8">
      <div class="text-center">
        <p class="text-sm text-gray-500">Monitoring Status for</p>
        <h2 class="text-xl sm:text-2xl md:text-3xl font-bold break-words">{{ monitorData.target_url }}</h2>
      </div>
      
      <StatusHeader :healthChecks="monitorData.health_checks" />

      <Card class="border-gray-200 shadow-sm">
        <CardHeader>
          <CardTitle class="text-lg sm:text-xl">Response Time</CardTitle>
        </CardHeader>
        <CardContent class="p-2 sm:p-4">
          <div class="h-64 sm:h-80">
            <ResponseChart :healthChecks="monitorData.health_checks" />
          </div>
        </CardContent>
      </Card>

      <Card class="border-gray-200 shadow-sm">
        <CardHeader>
          <CardTitle class="text-lg sm:text-xl">Health Check History</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="overflow-x-auto">
            <HistoryTable :healthChecks="monitorData.health_checks" />
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
