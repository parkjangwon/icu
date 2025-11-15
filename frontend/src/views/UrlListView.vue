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
    if (!confirm('정말로 이 URL과 관련된 모든 히스토리 데이터를 삭제하시겠습니까?')) {
      return;
    }

    await axios.delete(`/api/urls/${uniqueId}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    // Remove from local list without full refetch
    urls.value = urls.value.filter(u => u.unique_id !== uniqueId);
  } catch (err: any) {
    console.error('Failed to delete URL:', err);
    alert(err.response?.data?.error || '삭제에 실패했습니다. 잠시 후 다시 시도해주세요.');
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
    alert(err.response?.data?.error || '상태 변경에 실패했습니다.');
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
      <h1 class="text-3xl font-bold tracking-tight text-gray-900 dark:text-white mb-2">
        Your Monitored URLs
      </h1>
      <p class="text-base text-gray-600 dark:text-gray-400">
        Manage and view all your monitoring URLs
      </p>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex justify-center items-center py-20">
      <div class="text-center">
        <p class="text-gray-600 dark:text-gray-400 text-lg">Loading your URLs...</p>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="errorMessage" class="text-center py-20">
      <div class="text-red-600 dark:text-red-400 text-lg font-medium">
        {{ errorMessage }}
      </div>
    </div>

    <!-- Empty State -->
    <div v-else-if="urls.length === 0" class="text-center py-20">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">
        No URLs Yet
      </h3>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
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
    <div v-else class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead class="bg-gray-50 dark:bg-gray-900">
          <tr>
            <th scope="col" class="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              URL
            </th>
            <th scope="col" class="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              Status
            </th>
            <th scope="col" class="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              Last
            </th>
            <th scope="col" class="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              Added Date
            </th>
            <th scope="col" class="px-6 py-4 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
          <tr
            v-for="url in urls"
            :key="url.id"
            @click="navigateToMonitor(url.unique_id)"
            class="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
          >
            <td class="px-6 py-4 whitespace-nowrap">
              <div class="text-sm font-medium text-gray-900 dark:text-white">
                {{ url.target_url }}
              </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
              <button
                class="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                :class="url.is_active
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-gray-500/30 text-white dark:bg-gray-700 text-white'"
                @click.stop="(e) => toggleActive(url, e)"
                title="클릭하여 상태 전환"
              >
                {{ url.is_active ? 'Active' : 'Inactive' }}
              </button>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
              <div class="flex items-center gap-3">
                <span
                  v-if="url.last_is_up === true"
                  class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                  title="마지막 체크 결과: UP"
                >
                  [UP]&nbsp;&nbsp;
                </span>
                <span
                  v-else-if="url.last_is_up === false"
                  class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                  title="마지막 체크 결과: DOWN"
                >
                  [DOWN]&nbsp;&nbsp;
                </span>
                <span
                  v-else
                  class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
                  title="아직 체크 이력이 없습니다"
                >
                  —
                </span>
                <span v-if="url.last_checked_at" class="text-xs text-gray-500 dark:text-gray-400">
                  {{ new Date(url.last_checked_at).toLocaleString() }}
                </span>
              </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
              {{ formatDate(url.created_at) }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right">
              <button
                @click.stop="deleteUrl(url.unique_id)"
                class="px-3 py-1.5 text-xs font-semibold rounded-md bg-red-600 text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                title="URL 및 히스토리 삭제"
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
