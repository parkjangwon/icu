<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSupabaseClient } from '@/composables/useSupabaseClient';

interface MonitoredUrl {
  id: number;
  unique_id: string;
  target_url: string;
  is_active: boolean;
  created_at: string;
  // Backend enrichment fields
  last_is_up?: boolean | null;
  last_checked_at?: string | null;
}

const router = useRouter();
const supabase = useSupabaseClient();
const urls = ref<MonitoredUrl[]>([]);
const isLoading = ref(true);
const errorMessage = ref('');

const fetchUrls = async (silent = false) => {
  if (!silent) {
    isLoading.value = true;
  }
  errorMessage.value = '';

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      errorMessage.value = 'You must be logged in';
      router.push('/login');
      return;
    }

    const response = await axios.get('/api/urls', {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    urls.value = response.data.urls || [];
  } catch (error: any) {
    errorMessage.value = error.response?.data?.error || 'Failed to load URLs';
    console.error('Error fetching URLs:', error);
  } finally {
    if (!silent) {
      isLoading.value = false;
    }
  }
};

const navigateToMonitor = (uniqueId: string) => {
  router.push({ name: 'monitor', params: { uniqueId } });
};

const deleteUrl = async (uniqueId: string) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/login');
      return;
    }

    if (!confirm('Are you sure you want to delete this URL and all its history data?')) {
      return;
    }

    await axios.delete(`/api/urls/${uniqueId}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    await fetchUrls();
  } catch (err: any) {
    console.error('Failed to delete URL:', err);
    alert(err.response?.data?.error || 'Failed to delete. Please try again later.');
  }
};

const toggleActive = async (item: MonitoredUrl, e?: Event) => {
  if (e) e.stopPropagation();
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/login');
      return;
    }

    const next = !item.is_active;
    const { data } = await axios.patch(
      `/api/urls/${item.unique_id}/active`,
      { is_active: next },
      { headers: { Authorization: `Bearer ${session.access_token}` } }
    );

    item.is_active = data?.is_active ?? next;
  } catch (err: any) {
    console.error('Failed to toggle status:', err);
    alert(err.response?.data?.error || 'Failed to change status.');
  }
};

const formatDate = (dateString: string) => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric'
  });
};

let refreshTimer: number | undefined;

onMounted(() => {
  fetchUrls();
  refreshTimer = window.setInterval(() => fetchUrls(true), 10000);
});

onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer);
});
</script>

<template>
  <div class="max-w-7xl mx-auto">
    <div class="mb-8">
      <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-black mb-1">
        Your Monitored URLs
      </h1>
      <p class="text-sm sm:text-base text-gray-600">
        Manage and view all your monitoring URLs
      </p>
    </div>

    <div v-if="isLoading" class="text-center py-20">
      <p class="text-gray-600">Loading your URLs...</p>
    </div>
    <div v-else-if="errorMessage" class="text-center py-20 text-red-600">
      {{ errorMessage }}
    </div>
    <div v-else-if="urls.length === 0" class="text-center py-20">
      <h3 class="text-xl font-semibold text-black mb-2">No URLs Yet</h3>
      <p class="text-sm text-gray-600 mb-6">Start monitoring your first URL to see it here</p>
      <a href="#" @click.prevent="router.push('/')" class="inline-block bg-blue-600 text-white px-5 py-2.5 rounded-md hover:bg-blue-700">Add Your First URL</a>
    </div>

    <div v-else>
      <!-- Desktop Table -->
      <div class="hidden md:block bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th scope="col" class="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">URL</th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Last Check</th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Added</th>
              <th scope="col" class="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-for="url in urls" :key="`desktop-${url.id}`" @click="navigateToMonitor(url.unique_id)" class="hover:bg-gray-50 cursor-pointer">
              <td class="px-6 py-4 whitespace-nowrap"><div class="text-sm font-medium text-black truncate max-w-sm">{{ url.target_url }}</div></td>
              <td class="px-6 py-4 whitespace-nowrap">
                <button
                  class="px-3 py-1 text-xs font-semibold rounded-full"
                  :class="url.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-800'"
                  @click.stop="toggleActive(url, $event)"
                  title="Click to toggle status"
                >{{ url.is_active ? 'Active' : 'Inactive' }}</button>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center gap-2">
                  <span v-if="url.last_is_up === true" class="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 rounded-full">UP</span>
                  <span v-else-if="url.last_is_up === false" class="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800 rounded-full">DOWN</span>
                  <span v-else class="text-xs text-gray-500">—</span>
                  <span class="text-xs text-gray-500">{{ formatDate(url.last_checked_at!) }}</span>
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{{ formatDate(url.created_at) }}</td>
              <td class="px-6 py-4 whitespace-nowrap text-right">
                <Button @click.stop="deleteUrl(url.unique_id)" variant="destructive" size="sm">Delete</Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile Card List -->
      <div class="md:hidden space-y-4">
        <Card v-for="url in urls" :key="`mobile-${url.id}`" @click="navigateToMonitor(url.unique_id)" class="bg-white shadow-md border-gray-200">
          <CardHeader>
            <CardTitle class="flex justify-between items-start">
              <span class="font-semibold text-base break-all">{{ url.target_url }}</span>
              <span class="ml-4 flex-shrink-0 px-2 py-1 text-xs rounded-full" :class="url.last_is_up === true ? 'bg-green-100 text-green-800' : url.last_is_up === false ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'">
                {{ url.last_is_up === true ? 'UP' : url.last_is_up === false ? 'DOWN' : 'N/A' }}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent class="text-sm text-gray-600">
            <p><strong>Added:</strong> {{ formatDate(url.created_at) }}</p>
            <p><strong>Last Check:</strong> {{ formatDate(url.last_checked_at!) }}</p>
          </CardContent>
          <CardFooter class="flex justify-end gap-2">
            <Button @click.stop="toggleActive(url, $event)" :variant="url.is_active ? 'secondary' : 'default'" size="sm">
              {{ url.is_active ? 'Deactivate' : 'Activate' }}
            </Button>
            <Button @click.stop="deleteUrl(url.unique_id)" variant="destructive" size="sm">
              Delete
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  </div>
</template>
