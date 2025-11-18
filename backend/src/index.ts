/// <reference path="./types/express.d.ts" />

// This must be the first import
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { supabase, supabaseServiceRole } from './supabaseClient';
import { nanoid } from 'nanoid';
import { performHealthCheck, HealthCheckResult } from './utils/healthChecker';
import config from './config';
import { sendDiscord, sendSlack, sendTelegram } from './utils/notifications';

const app = express();
app.use(express.json());

// --- In-Memory Caches (for Health Checks ONLY) ---
const monitoredUrlsCache = new Map<string, any>(); // Map<url_id, url_object>
const healthHistoryCache = new Map<string, HealthCheckResult[]>(); // Map<url_id, HealthCheckResult[]>

// --- Middlewares ---
app.use(cors());
if (config.nodeEnv === 'production') {
    try {
        const supabaseOrigin = new URL(config.supabaseUrl).origin;
        const supabaseWsOrigin = supabaseOrigin.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
        app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    connectSrc: ["'self'", supabaseOrigin, supabaseWsOrigin],
                    imgSrc: ["'self'", 'data:', 'https:'],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'"],
                    objectSrc: ["'none'"],
                    baseUri: ["'self'"],
                    frameAncestors: ["'self'"],
                },
            },
            crossOriginEmbedderPolicy: false,
        }));
    } catch (e) {
        console.warn('Failed to configure CSP; falling back to default helmet.', (e as any)?.message || e);
        app.use(helmet());
    }
} else {
    app.use(helmet());
}
app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again after 15 minutes',
}));
const authenticate = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Authorization header missing' });
    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token missing' });
    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) return res.status(401).json({ error: 'Invalid or expired token' });
        req.user = user;
        next();
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// --- Helper Functions ---
const isValidUrl = (url: string): boolean => {
    try { new URL(url); return true; } catch { return false; }
};
const buildOutageMessage = (targetUrl: string): string => {
    try {
        const u = new URL(targetUrl);
        return `🚨 [ICU] Check Your Service! ( ${u.protocol}//${u.host} )`;
    } catch {
        return `🚨 [ICU] Check Your Service! ( ${targetUrl} )`;
    }
};
const buildTestMessage = (): string => `🤖 [ICU] Notification Test!`;

// --- API Endpoints ---

app.get('/api/urls', authenticate, async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated.' });

    try {
        const { data: urls, error } = await supabaseServiceRole
            .from('monitored_urls')
            .select('id, unique_id, target_url, is_active, created_at, last_check_status, last_check_time')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        
        const enrichedUrls = (urls || []).map(dbUrl => {
            const history = healthHistoryCache.get(dbUrl.id) || [];
            const lastCheckFromHistory = history[0];

            const last_check_status = lastCheckFromHistory ? (lastCheckFromHistory.isSuccess ? 'UP' : 'DOWN') : dbUrl.last_check_status;
            const last_check_time = lastCheckFromHistory?.checkTime ?? dbUrl.last_check_time;

            return {
                ...dbUrl,
                last_check_status: last_check_status,
                last_is_up: last_check_status === 'UP',
                last_checked_at: last_check_time,
            };
        });

        res.status(200).json({ urls: enrichedUrls });
    } catch (error) {
        console.error('Error in /api/urls:', error);
        res.status(500).json({ error: 'An unexpected error occurred.' });
    }
});

app.get('/api/monitor/:uniqueId', authenticate, async (req: Request, res: Response) => {
    const { uniqueId } = req.params;
    const userId = req.user?.id;

    try {
        const { data: urlData, error: urlError } = await supabaseServiceRole
            .from('monitored_urls')
            .select('id, target_url, is_active, last_check_status, last_check_time')
            .eq('unique_id', uniqueId)
            .eq('user_id', userId)
            .single();

        if (urlError || !urlData) {
            return res.status(404).json({ error: 'Monitoring ID not found or not authorized.' });
        }

        const history = healthHistoryCache.get(urlData.id) || [];
        const lastCheckFromHistory = history[0];

        const live_last_check_status = lastCheckFromHistory ? (lastCheckFromHistory.isSuccess ? 'UP' : 'DOWN') : urlData.last_check_status;
        const live_last_check_time = lastCheckFromHistory?.checkTime ?? urlData.last_check_time;

        res.status(200).json({ 
            ...urlData, 
            health_checks: history,
            last_check_status: live_last_check_status,
            last_check_time: live_last_check_time,
        });
    } catch (error) {
        console.error(`Error in /api/monitor/${uniqueId}:`, error);
        res.status(500).json({ error: 'An unexpected error occurred.' });
    }
});

app.delete('/api/urls/:uniqueId', authenticate, async (req: Request, res: Response) => {
    const { uniqueId } = req.params;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated.' });

    try {
        const { error } = await supabaseServiceRole
            .from('monitored_urls')
            .delete()
            .eq('unique_id', uniqueId)
            .eq('user_id', userId);
        if (error) throw error;
        return res.status(200).json({ message: 'URL and related history deleted.' });
    } catch (e) {
        console.error('Unexpected error in DELETE /api/urls/:uniqueId:', e);
        return res.status(500).json({ error: 'An unexpected error occurred.' });
    }
});

app.patch('/api/urls/:uniqueId/active', authenticate, async (req: Request, res: Response) => {
    const { uniqueId } = req.params;
    const { is_active } = req.body as { is_active?: boolean };
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated.' });

    try {
        const { data: urlData, error: urlError } = await supabaseServiceRole
            .from('monitored_urls')
            .select('id, is_active')
            .eq('unique_id', uniqueId)
            .eq('user_id', userId)
            .single();
        if (urlError || !urlData) return res.status(404).json({ error: 'URL not found or not authorized.' });

        const nextValue = typeof is_active === 'boolean' ? is_active : !urlData.is_active;
        const { data: updated, error: updateError } = await supabaseServiceRole
            .from('monitored_urls')
            .update({ is_active: nextValue })
            .eq('id', urlData.id)
            .select('id, is_active')
            .single();
        if (updateError || !updated) return res.status(500).json({ error: 'Failed to update status.' });

        return res.status(200).json({ message: 'Status updated.', is_active: updated.is_active });
    } catch (e) {
        console.error('Unexpected error in PATCH /api/urls/:uniqueId/active:', e);
        return res.status(500).json({ error: 'An unexpected error occurred.' });
    }
});

app.post('/api/register-url', authenticate, async (req: Request, res: Response) => {
    const { url } = req.body;
    const userId = req.user?.id;
    if (!userId || !url || typeof url !== 'string' || !isValidUrl(url)) {
        return res.status(400).json({ error: 'A valid URL and authentication are required' });
    }

    try {
        const { data, error } = await supabaseServiceRole
            .from('monitored_urls')
            .insert({
                target_url: url,
                unique_id: nanoid(32),
                user_id: userId,
                last_check_status: 'UP',
                last_check_time: new Date().toISOString(),
                last_status_change_time: new Date().toISOString(),
            })
            .select('unique_id')
            .single();

        if (error) {
            if (error.code === '23505') return res.status(409).json({ error: 'This URL is already registered.' });
            throw error;
        }
        res.status(201).json({ unique_id: data.unique_id });
    } catch (error) {
        console.error('Error in /api/register-url:', error);
        res.status(500).json({ error: 'An unexpected error occurred.' });
    }
});

// --- Notification Endpoints (read/write to DB) ---
app.get('/api/notification-settings', authenticate, async (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated.' });
    const { data, error } = await supabaseServiceRole.from('notification_settings').select('*').eq('user_id', userId);
    if (error) return res.status(500).json({ error: 'Failed to fetch settings.' });
    res.status(200).json({ settings: data || [] });
});

app.get('/api/notification-preferences', authenticate, async (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated.' });
    const { data, error } = await supabaseServiceRole.from('notification_preferences').select('*').eq('user_id', userId).single();
    if (error && error.code !== 'PGRST116') return res.status(500).json({ error: 'Failed to fetch preferences.' });
    res.status(200).json(data || { notifications_enabled: true, active_provider: null });
});

app.post('/api/notification-preferences', authenticate, async (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated.' });
    const { notifications_enabled, active_provider } = req.body;
    const { data, error } = await supabaseServiceRole
        .from('notification_preferences')
        .upsert({ user_id: userId, notifications_enabled, active_provider }, { onConflict: 'user_id' })
        .select()
        .single();
    if (error) return res.status(500).json({ error: 'Failed to save preferences.' });
    res.status(200).json(data);
});

app.post('/api/notification-settings/upsert', authenticate, async (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated.' });

    const { provider, is_enabled, config } = req.body;
    if (!provider || typeof is_enabled !== 'boolean' || !config) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }

    try {
        const { data, error } = await supabaseServiceRole
            .from('notification_settings')
            .upsert({
                user_id: userId,
                provider,
                is_enabled,
                config,
            }, { onConflict: 'user_id, provider' })
            .select()
            .single();

        if (error) throw error;
        res.status(200).json(data);
    } catch (error) {
        console.error('Error in /api/notification-settings/upsert:', error);
        res.status(500).json({ error: 'Failed to save settings.' });
    }
});

app.post('/api/notification-settings/test', authenticate, async (req, res) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated.' });

    const { provider } = req.body;
    if (!provider) {
        return res.status(400).json({ error: 'Provider is required.' });
    }

    try {
        const { data: setting, error } = await supabaseServiceRole
            .from('notification_settings')
            .select('config')
            .eq('user_id', userId)
            .eq('provider', provider)
            .single();

        if (error || !setting) {
            return res.status(404).json({ error: 'Settings not found for this provider.' });
        }

        const message = buildTestMessage();
        let promise;
        switch (provider) {
            case 'telegram':
                promise = sendTelegram({ botToken: setting.config.bot_token, chatId: setting.config.chat_id, message });
                break;
            case 'slack':
                promise = sendSlack({ webhookUrl: setting.config.webhook_url, message });
                break;
            case 'discord':
                promise = sendDiscord({ webhookUrl: setting.config.webhook_url, message });
                break;
            default:
                return res.status(400).json({ error: 'Unsupported provider.' });
        }

        await promise;
        res.status(200).json({ message: 'Test notification sent.' });
    } catch (error) {
        console.error(`Error in /api/notification-settings/test for ${provider}:`, error);
        res.status(500).json({ error: 'Failed to send test notification.' });
    }
});

// --- Health Check Scheduler ---

const runAllHealthChecks = async () => {
    if (monitoredUrlsCache.size === 0) return;
    console.log(`Running health checks for ${monitoredUrlsCache.size} URLs from cache...`);

    const urlsToCheck = Array.from(monitoredUrlsCache.values());
    const checkPromises = urlsToCheck.map(url => performHealthCheck(url.target_url));
    const results = await Promise.all(checkPromises);

    const checkTime = new Date().toISOString();
    const urlsThatWentDown: any[] = [];
    const urlsToDeactivate: string[] = [];

    for (let i = 0; i < urlsToCheck.length; i++) {
        const url = urlsToCheck[i];
        const result = results[i];
        const newStatus = result.isSuccess ? 'UP' : 'DOWN';
        const oldStatus = url.last_check_status;

        const history = healthHistoryCache.get(url.id) || [];
        history.unshift({ ...result, checkTime });
        healthHistoryCache.set(url.id, history.slice(0, 10));

        url.last_check_time = checkTime;
        url.last_check_status = newStatus;

        if (newStatus !== oldStatus) {
            console.log(`Status change for ${url.target_url}: ${oldStatus} -> ${newStatus}`);
            url.last_status_change_time = checkTime;
            if (newStatus === 'DOWN') {
                urlsThatWentDown.push(url);
            }
        }

        if (url.is_active && history.length >= 3 && history.slice(0, 3).every(r => !r.isSuccess)) {
            console.log(`URL ${url.target_url} has been down for 3 consecutive checks. Deactivating.`);
            urlsToDeactivate.push(url.id);
            url.is_active = false;
        }
    }

    if (urlsToDeactivate.length > 0) {
        console.log(`Deactivating ${urlsToDeactivate.length} URLs in DB.`);
        const uniqueUrlsToDeactivate = [...new Set(urlsToDeactivate)];
        const deactivatePromises = uniqueUrlsToDeactivate.map(id =>
            supabaseServiceRole.from('monitored_urls').update({ is_active: false }).eq('id', id)
        );
        await Promise.all(deactivatePromises).catch(err => console.error("Error deactivating URLs:", err));
    }

    if (urlsThatWentDown.length > 0) {
        const userIds = [...new Set(urlsThatWentDown.map(u => u.user_id))];
        
        const { data: prefs } = await supabaseServiceRole.from('notification_preferences').select('*').in('user_id', userIds);
        const { data: settings } = await supabaseServiceRole.from('notification_settings').select('*').in('user_id', userIds);

        const prefsMap = new Map((prefs || []).map(p => [p.user_id, p]));
        const settingsMap = new Map<string, any[]>();
        (settings || []).forEach(s => {
            if (!settingsMap.has(s.user_id)) settingsMap.set(s.user_id, []);
            settingsMap.get(s.user_id)!.push(s);
        });

        const notificationsToSend: any[] = [];
        for (const url of urlsThatWentDown) {
            const userPref = prefsMap.get(url.user_id) || { notifications_enabled: true };
            if (userPref.notifications_enabled) {
                const providerName = userPref.active_provider;
                const userSettings = settingsMap.get(url.user_id) || [];
                const providerSetting = userSettings.find(s => s.provider === providerName && s.is_enabled);
                if (providerSetting) {
                    notificationsToSend.push({
                        provider: providerSetting.provider,
                        config: providerSetting.config,
                        message: buildOutageMessage(url.target_url),
                    });
                }
            }
        }

        if (notificationsToSend.length > 0) {
            console.log(`Sending ${notificationsToSend.length} notifications...`);
            const notificationPromises = notificationsToSend.map(n => {
                if (n.provider === 'telegram') return sendTelegram({ botToken: n.config.bot_token, chatId: n.config.chat_id, message: n.message });
                if (n.provider === 'slack') return sendSlack({ webhookUrl: n.config.webhook_url, message: n.message });
                if (n.provider === 'discord') return sendDiscord({ webhookUrl: n.config.webhook_url, message: n.message });
                return Promise.resolve();
            });
            await Promise.allSettled(notificationPromises);
        }
    }

    console.log('Finished periodic health checks.');
};

// --- Server Initialization ---

const initializeUrlCacheAndSubscribe = async () => {
    console.log('Initializing URL cache...');
    const { data, error } = await supabaseServiceRole.from('monitored_urls').select('*').eq('is_active', true);
    if (error) throw new Error('FATAL: Could not initialize URL cache.');

    monitoredUrlsCache.clear();
    healthHistoryCache.clear();
    (data || []).forEach(url => monitoredUrlsCache.set(url.id, url));
    console.log(`URL cache initialized with ${monitoredUrlsCache.size} items.`);

    supabase.channel('public:monitored_urls')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'monitored_urls' }, (payload) => {
            console.log('Realtime change received for monitored_urls:', payload.eventType);
            const newRecord = payload.new as any;
            const oldId = (payload.old as any)?.id;

            if (payload.eventType === 'INSERT' && newRecord.is_active) {
                monitoredUrlsCache.set(newRecord.id, newRecord);
            } else if (payload.eventType === 'UPDATE') {
                if (newRecord.is_active) {
                    monitoredUrlsCache.set(newRecord.id, newRecord);
                } else {
                    monitoredUrlsCache.delete(newRecord.id);
                    healthHistoryCache.delete(newRecord.id);
                }
            } else if (payload.eventType === 'DELETE') {
                monitoredUrlsCache.delete(oldId);
                healthHistoryCache.delete(oldId);
            }
        })
        .subscribe(status => {
            if (status === 'SUBSCRIBED') console.log('Successfully subscribed to Realtime URL changes!');
        });
};

// --- Server Start ---
app.listen(config.serverPort, async () => {
    console.log(`Server is running at http://localhost:${config.serverPort} in ${config.nodeEnv} mode`);
    
    await initializeUrlCacheAndSubscribe();
    
    setInterval(runAllHealthChecks, config.healthCheckIntervalMs);
    console.log(`Health check scheduler started. Will run every ${config.healthCheckIntervalMs / 1000} seconds.`);
    
    setTimeout(runAllHealthChecks, 5000); 
});

// Serve frontend in production
if (config.nodeEnv === 'production') {
    const distDir = path.resolve(__dirname, '../../frontend/dist');
    app.use(express.static(distDir));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}
