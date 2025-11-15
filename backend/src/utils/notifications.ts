import axios from 'axios';

export async function sendTelegram(params: { botToken: string; chatId: string; message: string }) {
  const { botToken, chatId, message } = params;
  if (!botToken || !chatId) throw new Error('Telegram botToken and chatId are required');
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  // Send as plain text to avoid Markdown parsing issues with special characters like [ ] ( )
  await axios.post(url, { chat_id: chatId, text: message });
}

export async function sendSlack(params: { webhookUrl: string; message: string }) {
  const { webhookUrl, message } = params;
  if (!webhookUrl) throw new Error('Slack webhookUrl is required');
  await axios.post(webhookUrl, { text: message });
}

export async function sendDiscord(params: { webhookUrl: string; message: string }) {
  const { webhookUrl, message } = params;
  if (!webhookUrl) throw new Error('Discord webhookUrl is required');
  await axios.post(webhookUrl, { content: message });
}
