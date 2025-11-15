<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import axios from 'axios';
import { useRouter } from 'vue-router';
import { useSupabaseClient } from '@/composables/useSupabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Provider = 'telegram' | 'slack' | 'discord';
type ProviderOrNone = Provider | 'none';

interface SettingRow {
  provider: Provider;
  is_enabled: boolean;
  config: any;
}

const supabase = useSupabaseClient();
const router = useRouter();
const loading = ref(true);
const errorMessage = ref('');
const masterEnabled = ref(true);
const selectedProvider = ref<ProviderOrNone>('none');

const telegram = ref<{ bot_token: string; chat_id: string }>({ bot_token: '', chat_id: '' });
const slack = ref<{ webhook_url: string }>({ webhook_url: '' });
const discord = ref<{ webhook_url: string }>({ webhook_url: '' });

async function loadSettings() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/login');
      return;
    }
    const { data } = await axios.get('/api/notification-settings', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const rows: SettingRow[] = data.settings || [];
    for (const r of rows) {
      if (r.provider === 'telegram') {
        telegram.value = { bot_token: r.config?.bot_token || '', chat_id: r.config?.chat_id || '' };
      } else if (r.provider === 'slack') {
        slack.value = { webhook_url: r.config?.webhook_url || '' };
      } else if (r.provider === 'discord') {
        discord.value = { webhook_url: r.config?.webhook_url || '' };
      }
    }
  } catch (e: any) {
    console.error(e);
    errorMessage.value = e?.response?.data?.error || 'Failed to load settings';
  } finally {
    loading.value = false;
  }
}

async function loadPreferences() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push('/login'); return; }
    const { data } = await axios.get('/api/notification-preferences', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    masterEnabled.value = data?.notifications_enabled !== false;
    selectedProvider.value = (data?.active_provider || 'none') as ProviderOrNone;
  } catch (e: any) {
    console.error(e);
    // keep default true on error
  }
}

async function savePreferences() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push('/login'); return; }
    await axios.post('/api/notification-preferences', {
      notifications_enabled: masterEnabled.value,
      active_provider: selectedProvider.value === 'none' ? null : selectedProvider.value,
    }, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    alert('Global preference saved');
  } catch (e: any) {
    console.error(e);
    alert(e?.response?.data?.error || 'Failed to save preference');
  }
}

async function saveProvider(provider: Provider) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push('/login'); return; }
    if (selectedProvider.value !== provider) {
      alert('Select this provider in Alert Type to save its configuration.');
      return;
    }
    const payload: any = { provider };
    if (provider === 'telegram') {
      if (!telegram.value.bot_token || !telegram.value.chat_id) {
        alert('Please enter Bot Token and Chat ID');
        return;
      }
      payload.is_enabled = true;
      payload.config = { bot_token: telegram.value.bot_token, chat_id: telegram.value.chat_id };
    } else if (provider === 'slack') {
      if (!slack.value.webhook_url) {
        alert('Please enter Webhook URL');
        return;
      }
      payload.is_enabled = true;
      payload.config = { webhook_url: slack.value.webhook_url };
    } else if (provider === 'discord') {
      if (!discord.value.webhook_url) {
        alert('Please enter Webhook URL');
        return;
      }
      payload.is_enabled = true;
      payload.config = { webhook_url: discord.value.webhook_url };
    }
    await axios.post('/api/notification-settings/upsert', payload, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    alert('Saved');
  } catch (e: any) {
    console.error(e);
    alert(e?.response?.data?.error || 'Failed to save');
  }
}

async function deleteProvider(provider: Provider) {
  if (!confirm('Delete this provider setting?')) return;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push('/login'); return; }
    await axios.delete(`/api/notification-settings/${provider}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (provider === 'telegram') {
      telegram.value = { bot_token: '', chat_id: '' };
    } else if (provider === 'slack') {
      slack.value = { webhook_url: '' };
    } else if (provider === 'discord') {
      discord.value = { webhook_url: '' };
    }
  } catch (e: any) {
    console.error(e);
    alert(e?.response?.data?.error || 'Failed to delete');
  }
}

async function sendTest() {
  try {
    if (!masterEnabled.value) {
      alert('Global notifications are disabled. Enable them first.');
      return;
    }
    if (selectedProvider.value === 'none') {
      alert('Select an Alert Type (provider) first.');
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push('/login'); return; }
    // Build override payload from current selection & form inputs
    const provider = selectedProvider.value as Provider;
    const payload: any = { provider, config: {} };
    if (provider === 'telegram') {
      if (!telegram.value.bot_token || !telegram.value.chat_id) {
        alert('Please enter Bot Token and Chat ID');
        return;
      }
      payload.config = { bot_token: telegram.value.bot_token, chat_id: telegram.value.chat_id };
    } else if (provider === 'slack') {
      if (!slack.value.webhook_url) {
        alert('Please enter Slack Incoming Webhook URL');
        return;
      }
      payload.config = { webhook_url: slack.value.webhook_url };
    } else if (provider === 'discord') {
      if (!discord.value.webhook_url) {
        alert('Please enter Discord Webhook URL');
        return;
      }
      payload.config = { webhook_url: discord.value.webhook_url };
    }

    const { data } = await axios.post('/api/notification-settings/test', payload, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (data?.sent) {
      alert('Test notification sent. Please check your channel.');
    } else {
      alert('Test request completed.');
    }
  } catch (e: any) {
    console.error(e);
    alert(e?.response?.data?.error || 'Failed to send test notification');
  }
}

onMounted(async () => {
  await Promise.all([loadSettings(), loadPreferences()]);
});
</script>

<template>
  <div class="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">Notification</h1>
    </div>

    <div v-if="loading" class="text-gray-500">Loading...</div>
    <div v-else-if="errorMessage" class="text-red-600">{{ errorMessage }}</div>

    <Card>
      <CardHeader>
        <CardTitle>Global Preference</CardTitle>
      </CardHeader>
      <CardContent class="space-y-3">
        <label class="inline-flex items-center space-x-2">
          <input v-model="masterEnabled" type="checkbox" />
          <span>Enable notifications (turn off to disable ALL notifications)</span>
        </label>
        <p class="text-xs text-gray-500" v-if="!masterEnabled">
          All provider notifications are disabled while this is off.
        </p>

        <div class="mt-3">
          <div class="text-sm font-medium mb-2">Alert Type</div>
          <div class="flex flex-col gap-2">
            <label class="inline-flex items-center gap-2">
              <input :disabled="!masterEnabled" type="radio" value="none" v-model="selectedProvider" />
              <span>None</span>
            </label>
            <label class="inline-flex items-center gap-2">
              <input :disabled="!masterEnabled" type="radio" value="telegram" v-model="selectedProvider" />
              <span>Telegram</span>
            </label>
            <label class="inline-flex items-center gap-2">
              <input :disabled="!masterEnabled" type="radio" value="slack" v-model="selectedProvider" />
              <span>Slack</span>
            </label>
            <label class="inline-flex items-center gap-2">
              <input :disabled="!masterEnabled" type="radio" value="discord" v-model="selectedProvider" />
              <span>Discord</span>
            </label>
          </div>
          <p class="text-xs text-gray-500 mt-1">Only one provider can be active at a time. Choose “None” to keep notifications off at the provider level.</p>
        </div>

        <div class="flex gap-2">
          <button class="px-4 py-2 rounded bg-blue-600 text-white" @click="savePreferences">Save Preference</button>
        </div>
      </CardContent>
    </Card>

    <Card v-if="selectedProvider === 'telegram'">
      <CardHeader>
        <CardTitle>Telegram</CardTitle>
      </CardHeader>
      <CardContent class="space-y-3">
        <label class="block" style="margin-bottom: 20px;">
          <span class="text-sm" style="margin-right: 10px;">Bot Token</span>
          <input :disabled="!masterEnabled" v-model="telegram.bot_token" type="password" class="mt-1 max-w-md rounded-md border p-2 bg-white dark:bg-neutral-900 disabled:opacity-60" placeholder="123456:ABC-DEF..." />
        </label>
        <label class="block" style="margin-bottom: 20px;">
          <span class="text-sm" style="margin-right: 10px;">Chat ID</span>
          <input :disabled="!masterEnabled" v-model="telegram.chat_id" type="text" class="mt-1 max-w-md rounded-md border p-2 bg-white dark:bg-neutral-900 disabled:opacity-60" placeholder="@channelusername or numeric id" />
        </label>
        <div class="flex gap-2">
          <button :disabled="!masterEnabled" class="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60" @click="saveProvider('telegram')">Save</button>
          <button :disabled="!masterEnabled" class="px-4 py-2 rounded bg-gray-200 dark:bg-neutral-800 disabled:opacity-60" @click="deleteProvider('telegram')">Delete</button>
          <button :disabled="!masterEnabled" class="px-4 py-2 rounded bg-emerald-600 text-white disabled:opacity-60" @click="sendTest">Send Test</button>
        </div>
      </CardContent>
    </Card>

    <Card v-if="selectedProvider === 'slack'">
      <CardHeader>
        <CardTitle>Slack</CardTitle>
      </CardHeader>
      <CardContent class="space-y-3">
        <label class="block" style="margin-bottom: 20px;">
          <span class="text-sm" style="margin-right: 10px;">Incoming Webhook URL</span>
          <input :disabled="!masterEnabled" v-model="slack.webhook_url" type="text" class="mt-1 max-w-md rounded-md border p-2 bg-white dark:bg-neutral-900 disabled:opacity-60" placeholder="https://hooks.slack.com/services/..." />
        </label>
        <div class="flex gap-2">
          <button :disabled="!masterEnabled" class="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60" @click="saveProvider('slack')">Save</button>
          <button :disabled="!masterEnabled" class="px-4 py-2 rounded bg-gray-200 dark:bg-neutral-800 disabled:opacity-60" @click="deleteProvider('slack')">Delete</button>
          <button :disabled="!masterEnabled" class="px-4 py-2 rounded bg-emerald-600 text-white disabled:opacity-60" @click="sendTest">Send Test</button>
        </div>
      </CardContent>
    </Card>

    <Card v-if="selectedProvider === 'discord'">
      <CardHeader>
        <CardTitle>Discord</CardTitle>
      </CardHeader>
      <CardContent class="space-y-3">
        <label class="block" style="margin-bottom: 20px;">
          <span class="text-sm" style="margin-right: 10px;">Webhook URL</span>
          <input :disabled="!masterEnabled" v-model="discord.webhook_url" type="text" class="mt-1 max-w-md rounded-md border p-2 bg-white dark:bg-neutral-900 disabled:opacity-60" placeholder="https://discord.com/api/webhooks/..." />
        </label>
        <div class="flex gap-2">
          <button :disabled="!masterEnabled" class="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60" @click="saveProvider('discord')">Save</button>
          <button :disabled="!masterEnabled" class="px-4 py-2 rounded bg-gray-200 dark:bg-neutral-800 disabled:opacity-60" @click="deleteProvider('discord')">Delete</button>
          <button :disabled="!masterEnabled" class="px-4 py-2 rounded bg-emerald-600 text-white disabled:opacity-60" @click="sendTest">Send Test</button>
        </div>
      </CardContent>
    </Card>

    <div v-if="selectedProvider === 'none'" class="text-sm text-gray-600 dark:text-gray-300">
      Select an Alert Type above to configure its credentials.
    </div>
  </div>
  
</template>
