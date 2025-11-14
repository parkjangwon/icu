<script setup lang="ts">
import { ref, defineProps, onMounted } from 'vue';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const props = defineProps<{
  uniqueId: string;
  accessToken: string | null; // Accept accessToken as a prop
}>();

const notificationType = ref<'email' | 'webhook'>('email');
const email = ref('');
const webhookUrl = ref('');
const webhookMethod = ref('POST');
const webhookHeaders = ref('');
const isLoading = ref(false);
const message = ref('');
const messageType = ref<'success' | 'error'>('success');

onMounted(async () => {
  if (!props.accessToken) {
    console.error('Access token not provided to NotificationForm.');
    return;
  }
  try {
    const response = await axios.get(`/api/notification-settings/${props.uniqueId}`, {
      headers: {
        Authorization: `Bearer ${props.accessToken}`,
      },
    });
    const settings = response.data;
    if (settings) {
      notificationType.value = settings.notificationType || 'email';
      email.value = settings.email || '';
      webhookUrl.value = settings.webhookUrl || '';
      webhookMethod.value = settings.webhookMethod || 'POST';
      webhookHeaders.value = settings.webhookHeaders ? JSON.stringify(settings.webhookHeaders, null, 2) : '';
    }
  } catch (error) {
    console.error('Failed to fetch notification settings.', error);
  }
});

const saveSettings = async () => {
  if (!props.accessToken) {
    message.value = 'Authentication token missing. Please log in again.';
    messageType.value = 'error';
    return;
  }

  isLoading.value = true;
  message.value = '';
  try {
    let headers = {};
    if (notificationType.value === 'webhook' && webhookHeaders.value) {
      try {
        headers = JSON.parse(webhookHeaders.value);
      } catch (e) {
        message.value = 'Invalid JSON format for headers.';
        messageType.value = 'error';
        isLoading.value = false;
        return;
      }
    }

    const payload = {
      uniqueId: props.uniqueId,
      notificationType: notificationType.value,
      email: email.value,
      webhookUrl: webhookUrl.value,
      webhookMethod: webhookMethod.value,
      webhookHeaders: headers,
    };

    const response = await axios.post('/api/update-notification-settings', payload, {
      headers: {
        Authorization: `Bearer ${props.accessToken}`,
      },
    });
    message.value = response.data.message || 'Settings updated successfully!';
    messageType.value = 'success';
  } catch (error: any) {
    message.value = error.response?.data?.error || 'Failed to update settings.';
    messageType.value = 'error';
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <div>
    <p class="text-sm text-muted-foreground mb-4">
      Get an alert when your service goes down.
    </p>
    <form @submit.prevent="saveSettings" class="space-y-4">
      <RadioGroup v-model="notificationType" default-value="email" class="flex space-x-4">
        <div class="flex items-center space-x-2">
          <RadioGroupItem id="r1" value="email" />
          <Label for="r1">Email</Label>
        </div>
        <div class="flex items-center space-x-2">
          <RadioGroupItem id="r2" value="webhook" />
          <Label for="r2">Webhook</Label>
        </div>
      </RadioGroup>

      <div v-if="notificationType === 'email'" class="space-y-2">
        <Label for="email">Email Address</Label>
        <Input
          id="email"
          v-model="email"
          type="email"
          placeholder="your-email@example.com"
          :disabled="isLoading"
        />
      </div>

      <div v-if="notificationType === 'webhook'" class="space-y-4">
        <div class="space-y-2">
          <Label for="webhook-url">Webhook URL</Label>
          <Input
            id="webhook-url"
            v-model="webhookUrl"
            type="url"
            placeholder="https://your-webhook-url.com"
            :disabled="isLoading"
          />
        </div>
        <div class="space-y-2">
          <Label for="webhook-method">HTTP Method</Label>
          <Select v-model="webhookMethod" :disabled="isLoading">
            <SelectTrigger>
              <SelectValue placeholder="Select a method" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="POST">POST</SelectItem>
                <SelectItem value="GET">GET</SelectItem>
                <SelectItem value="PUT">PUT</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div class="space-y-2">
          <Label for="webhook-headers">Headers (JSON format)</Label>
          <Textarea
            id="webhook-headers"
            v-model="webhookHeaders"
            placeholder='{
  "Content-Type": "application/json",
  "Authorization": "Bearer your-token"
}'
            :disabled="isLoading"
            class="font-mono"
          />
        </div>
      </div>

      <Button
        type="submit"
        :disabled="isLoading"
      >
        <span v-if="!isLoading">Save</span>
        <span v-else>Saving...</span>
      </Button>
    </form>
    <div v-if="message" class="mt-4 text-sm" :class="{ 'text-green-500': messageType === 'success', 'text-red-500': messageType === 'error' }">
      {{ message }}
    </div>
  </div>
</template>
