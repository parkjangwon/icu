<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

    // Optional confirm dialog
    if (!confirm('Are you sure you want to delete this URL and all its history data?')) {
      return;
    }

    await axios.delete(`/api/urls/${uniqueId}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    // Refetch the list to show the change immediately
    await fetchUrls();
  } catch (err: any) {
    console.error('Failed to delete URL:', err);
    alert(err.response?.data?.error || 'Failed to delete. Please try again later.');
  }
};

const toggleActive = async (item: MonitoredUrl, e?: Event) => {
  try {
    if (e) e.stopPropagation();
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
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

let refreshTimer: number | undefined;

onMounted(() => {
  // Initial load
  fetchUrls();
  // Auto-refresh every 10 seconds (silent to avoid UI flicker)
  refreshTimer = window.setInterval(() => {
    fetchUrls(true);
  }, 10000);
});

onBeforeUnmount(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = undefined;
  }
});
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="mb-8">
      <h1 class="text-3xl font-bold tracking-tight text-black mb-2">
        Your Monitored URLs
      </h1>
      <p class="text-base text-gray-600">
        Manage and view all your monitoring URLs
      </p>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex justify-center items-center py-20">
      <div class="text-center">
        <p class="text-gray-600 text-lg">Loading your URLs...</p>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="errorMessage" class="text-center py-20">
      <div class="text-red-600 text-lg font-medium">
        {{ errorMessage }}
      </div>
    </div>

    <!-- Empty State -->
    <div v-else-if="urls.length === 0" class="text-center py-20">
      <h3 class="text-xl font-semibold text-black mb-2">
        No URLs Yet
      </h3>
      <p class="text-sm text-gray-600 mb-6">
        Start monitoring your first URL to see it here
      </p>
      <button
        @click="router.push('/')"
        class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
      >
        Add Your First URL
      </button>
    </div>

    <!-- URL Table Grid -->
    <div v-else class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th scope="col" class="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
              URL
            </th>
            <th scope="col" class="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Status
            </th>
            <th scope="col" class="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Last
            </th>
            <th scope="col" class="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Added Date
            </th>
            <th scope="col" class="px-6 py-4 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr
            v-for="url in urls"
            :key="url.id"
            @click="navigateToMonitor(url.unique_id)"
            class="hover:bg-gray-50 cursor-pointer transition-colors"
          >
            <td class="px-6 py-4 whitespace-nowrap">
              <div class="text-sm font-medium text-black">
                {{ url.target_url }}
              </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
              <button
                class="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                :class="url.is_active
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-500/30 text-white'"
                @click.stop="(e) => toggleActive(url, e)"
                title="Click to toggle status"
              >
                {{ url.is_active ? 'Active' : 'Inactive' }}
              </button>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
              <div class="flex items-center gap-3">
                <span
                  v-if="url.last_is_up === true"
                  class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"
                  title="Last check: UP"
                >
                  [UP]&nbsp;&nbsp;
                </span>
                <span
                  v-else-if="url.last_is_up === false"
                  class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"
                  title="Last check: DOWN"
                >
                  [DOWN]&nbsp;&nbsp;
                </span>
                <span
                  v-else
                  class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
                  title="No check history yet"
                >
                  —
                </span>
                <span v-if="url.last_checked_at" class="text-xs text-gray-500">
                  {{ new Date(url.last_checked_at).toLocaleString() }}
                </span>
              </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
              {{ formatDate(url.created_at) }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right">
              <button
                @click.stop="deleteUrl(url.unique_id)"
                class="px-3 py-1.5 text-xs font-semibold rounded-md bg-red-600 text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                title="Delete URL and history"
              >
                Delete
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
