/// <reference path="./types/express.d.ts" />

// This must be the first import to ensure environment variables are loaded
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { supabase, supabaseServiceRole } from './supabaseClient';
import { nanoid } from 'nanoid';
import { performHealthCheck } from './utils/healthChecker';
import axios from 'axios';
import config from './config';
import { sendDiscord, sendSlack, sendTelegram } from './utils/notifications';

const app = express();
app.use(express.json()); // Middleware to parse JSON bodies

// --- Security Middlewares ---
// IMPORTANT: Ensure 'cors', 'express-rate-limit', and 'helmet' are installed: npm install cors express-rate-limit helmet

// CORS Middleware
// In production, restrict to specific origins:
// app.use(cors({ origin: 'https://your-frontend-domain.com' }));
app.use(cors()); 

// Helmet for setting various security headers
app.use(helmet());

// Rate limiting to prevent abuse
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again after 15 minutes',
});
app.use(limiter);
// --- End Security Middlewares ---

// Authentication Middleware
const authenticate = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ error: 'Authorization header missing' });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token missing from Authorization header' });
    }

    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            console.error('Supabase auth error:', error);
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Error in authentication middleware:', error);
        return res.status(500).json({ error: 'Internal server error during authentication' });
    }
};

// --- Helper Functions ---

/**
 * Validates if a string is a valid URL.
 * @param url The string to validate.
 * @returns True if the URL is valid, false otherwise.
 */
const isValidUrl = (url: string): boolean => {
    try {
        new URL(url);
        return true;
    } catch (error) {
        return false;
    }
};

// Build unified outage message across providers
const buildOutageMessage = (targetUrl: string): string => {
    try {
        const u = new URL(targetUrl);
        const origin = `${u.protocol}//${u.host}`; // e.g., https://example.com
        return `🚨 [ICU] Check Your Service! ( ${origin} )`;
    } catch {
        return `🚨 [ICU] Check Your Service! ( ${targetUrl} )`;
    }
};

// Build unified TEST message across providers
const buildTestMessage = (): string => {
    return `🤖 [ICU] Notification Test!`;
};

// --- API Endpoints ---

// Get user's monitored URLs
app.get('/api/urls', authenticate, async (req: Request, res: Response) => {
    const userId = req.user?.id;

    if (!userId) {
        return res.status(401).json({ error: 'User not authenticated.' });
    }

    try {
        const { data: urls, error } = await supabaseServiceRole
            .from('monitored_urls')
            .select('id, unique_id, target_url, is_active, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Supabase fetch error:', error);
            return res.status(500).json({ error: 'Could not fetch URLs.' });
        }

        // Enrich with last status (UP/DOWN) and last checked time
        const enriched = [] as any[];
        for (const u of urls || []) {
            let lastIsUp: boolean | null = null;
            let lastCheckedAt: string | null = null;
            try {
                const { data: lastRows } = await supabaseServiceRole
                    .from('health_checks')
                    .select('is_success, check_time')
                    .eq('monitored_url_id', u.id)
                    .order('check_time', { ascending: false })
                    .limit(1);
                if (lastRows && lastRows.length > 0) {
                    lastIsUp = !!lastRows[0].is_success;
                    lastCheckedAt = lastRows[0].check_time;
                }
            } catch (e) {
                // ignore enrichment errors
            }
            enriched.push({ ...u, last_is_up: lastIsUp, last_checked_at: lastCheckedAt });
        }

        res.status(200).json({ urls: enriched });
    } catch (error) {
        console.error('Error in /api/urls:', error);
        res.status(500).json({ error: 'An unexpected error occurred.' });
    }
});

// Delete a monitored URL and its related history
app.delete('/api/urls/:uniqueId', authenticate, async (req: Request, res: Response) => {
    const { uniqueId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
        return res.status(401).json({ error: 'User not authenticated.' });
    }

    if (!uniqueId) {
        return res.status(400).json({ error: 'A unique ID is required.' });
    }

    try {
        // Verify ownership and get internal id
        const { data: urlData, error: urlError } = await supabaseServiceRole
            .from('monitored_urls')
            .select('id')
            .eq('unique_id', uniqueId)
            .eq('user_id', userId)
            .single();

        if (urlError || !urlData) {
            return res.status(404).json({ error: 'URL not found or not authorized.' });
        }

        // Delete related health checks using service role to avoid RLS edge-cases
        const { error: delChecksError } = await supabaseServiceRole
            .from('health_checks')
            .delete()
            .eq('monitored_url_id', urlData.id);

        if (delChecksError) {
            console.error('Error deleting related health checks:', delChecksError);
            // Continue; not fatal since we will remove URL anyway and FK cascade may exist
        }

        // Delete the monitored URL row
        const { error: delUrlError } = await supabaseServiceRole
            .from('monitored_urls')
            .delete()
            .eq('unique_id', uniqueId)
            .eq('user_id', userId);

        if (delUrlError) {
            console.error('Error deleting monitored URL:', delUrlError);
            return res.status(500).json({ error: 'Failed to delete URL.' });
        }

        return res.status(200).json({ message: 'URL and related history deleted.' });
    } catch (e) {
        console.error('Unexpected error in DELETE /api/urls/:uniqueId:', e);
        return res.status(500).json({ error: 'An unexpected error occurred.' });
    }
});

// Toggle or set active status for a URL
app.patch('/api/urls/:uniqueId/active', authenticate, async (req: Request, res: Response) => {
    const { uniqueId } = req.params;
    const { is_active } = req.body as { is_active?: boolean };
    const userId = req.user?.id;

    if (!userId) {
        return res.status(401).json({ error: 'User not authenticated.' });
    }

    if (!uniqueId) {
        return res.status(400).json({ error: 'A unique ID is required.' });
    }

    try {
        // Load current value and verify ownership
        const { data: urlData, error: urlError } = await supabaseServiceRole
            .from('monitored_urls')
            .select('id, is_active')
            .eq('unique_id', uniqueId)
            .eq('user_id', userId)
            .single();

        if (urlError || !urlData) {
            return res.status(404).json({ error: 'URL not found or not authorized.' });
        }

        const nextValue = typeof is_active === 'boolean' ? is_active : !urlData.is_active;

        const { data: updated, error: updateError } = await supabaseServiceRole
            .from('monitored_urls')
            .update({ is_active: nextValue })
            .eq('id', urlData.id)
            .select('id, unique_id, is_active')
            .single();

        if (updateError || !updated) {
            return res.status(500).json({ error: 'Failed to update status.' });
        }

        // If activated, immediately perform one health check to give fast feedback
        if (nextValue === true) {
            try {
                const result = await performHealthCheck((await supabaseServiceRole
                    .from('monitored_urls')
                    .select('target_url')
                    .eq('id', urlData.id)
                    .single()).data?.target_url || '');

                await supabaseServiceRole
                    .from('health_checks')
                    .insert({
                        monitored_url_id: urlData.id,
                        status_code: result.statusCode,
                        response_time_ms: result.responseTimeMs,
                        is_success: result.isSuccess,
                    });
            } catch (e) {
                console.error('Immediate health check after activation failed:', e);
            }
        }

        return res.status(200).json({ message: 'Status updated.', is_active: updated.is_active });
    } catch (e) {
        console.error('Unexpected error in PATCH /api/urls/:uniqueId/active:', e);
        return res.status(500).json({ error: 'An unexpected error occurred.' });
    }
});

// 4.B. URL 등록 API (POST /api/register-url)
app.post('/api/register-url', authenticate, async (req: Request, res: Response) => {
    const { url } = req.body;
    const userId = req.user?.id; // Get user ID from authenticated request

    if (!userId) {
        return res.status(401).json({ error: 'User not authenticated.' });
    }

    if (!url || typeof url !== 'string' || !isValidUrl(url)) {
        return res.status(400).json({ error: 'A valid URL is required' });
    }

    try {
        // 0) Per-user URL limit enforcement (free plan: max 5)
        const { count: userUrlCount, error: countError } = await supabaseServiceRole
            .from('monitored_urls')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId);

        if (countError) {
            console.error('Supabase count error:', countError);
            return res.status(500).json({ error: 'Could not check current URL count.' });
        }

        if ((userUrlCount ?? 0) >= 5) {
            return res.status(403).json({
                error: 'Free plan limit reached. You can register up to 5 URLs per account. Delete an existing URL or upgrade your plan.',
                code: 'LIMIT_REACHED',
                limit: 5,
            });
        }

        // 1) Perform a one-time reachability check before insertion
        // URL format already validated above; here we actually issue a request to ensure it is reachable
        try {
            console.log('[RegisterURL] Performing reachability check', { url });
            const result = await performHealthCheck(url);
            console.log('[RegisterURL] HealthCheck result', {
                url,
                statusCode: result.statusCode,
                responseTimeMs: result.responseTimeMs,
                isSuccess: result.isSuccess,
                error: result.error,
                cause: result.errorDetails ? {
                    code: result.errorDetails.code || result.errorDetails.causeCode,
                    errno: result.errorDetails.errno || result.errorDetails.causeErrno,
                    syscall: result.errorDetails.syscall || result.errorDetails.causeSyscall,
                    hostname: result.errorDetails.hostname || result.errorDetails.causeHostname,
                    address: result.errorDetails.address || result.errorDetails.causeAddress,
                    port: result.errorDetails.port || result.errorDetails.causePort,
                } : undefined,
            });
            if (!result.isSuccess) {
                return res.status(400).json({
                    error: 'Unable to connect to the specified URL. Please ensure the URL is up and running.',
                    details: {
                        statusCode: result.statusCode,
                        responseTimeMs: result.responseTimeMs,
                        error: result.error || undefined,
                        cause: result.errorDetails ? {
                            code: result.errorDetails.code || result.errorDetails.causeCode,
                            errno: result.errorDetails.errno || result.errorDetails.causeErrno,
                            syscall: result.errorDetails.syscall || result.errorDetails.causeSyscall,
                            hostname: result.errorDetails.hostname || result.errorDetails.causeHostname,
                            address: result.errorDetails.address || result.errorDetails.causeAddress,
                            port: result.errorDetails.port || result.errorDetails.causePort,
                        } : undefined,
                    },
                });
            }
        } catch (e) {
            // Even if performHealthCheck throws, respond with a user-friendly connectivity message
            console.error('[RegisterURL] HealthCheck threw', { url, error: (e as any)?.message || e });
            return res.status(400).json({ error: 'Unable to connect to the specified URL. Please ensure the URL is up and running.' });
        }

        // 2) Insert into DB
        const unique_id = nanoid(32); // Increased nanoid length to 32

        const { data, error } = await supabaseServiceRole
            .from('monitored_urls')
            .insert({
                target_url: url,
                unique_id: unique_id,
                user_id: userId, // Associate with the authenticated user
            })
            .select()
            .single();

        if (error) {
            console.error('Supabase insert error:', error);
            return res.status(500).json({ error: 'Could not register URL.' });
        }

        console.log(`Registered URL: ${url}, ID: ${unique_id}, User: ${userId}`);
        res.status(201).json({ unique_id: data.unique_id });

    } catch (error) {
        console.error('Error in /api/register-url:', error);
        res.status(500).json({ error: 'An unexpected error occurred.' });
    }
});

// 4.D. 모니터링 데이터 조회 API (GET /api/monitor/:uniqueId)
app.get('/api/monitor/:uniqueId', authenticate, async (req: Request, res: Response) => {
    const { uniqueId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
        return res.status(401).json({ error: 'User not authenticated.' });
    }

    if (!uniqueId) {
        return res.status(400).json({ error: 'A unique ID is required.' });
    }

    try {
        // 1. Find monitored_urls record by unique_id and user_id
        const { data: urlData, error: urlError } = await supabaseServiceRole
            .from('monitored_urls')
            // Only select columns that are guaranteed to exist. Legacy per-URL notification columns were removed.
            .select('id, target_url, is_active')
            .eq('unique_id', uniqueId)
            .eq('user_id', userId) // Filter by user_id
            .single();

        if (urlError || !urlData) {
            return res.status(404).json({ error: 'Monitoring ID not found or not authorized.' });
        }

        // 2. Get recent health_checks for the url (DB keeps only latest 10, but we still limit here)
        const { data: healthChecks, error: checksError } = await supabaseServiceRole
            .from('health_checks')
            .select('status_code, response_time_ms, check_time, is_success')
            .eq('monitored_url_id', urlData.id)
            .order('check_time', { ascending: false })
            .limit(10);

        if (checksError) {
            console.error('Supabase checks fetch error:', checksError);
            return res.status(500).json({ error: 'Could not fetch health checks.' });
        }

        res.status(200).json({
            ...urlData,
            health_checks: healthChecks || [],
        });

    } catch (error) {
        console.error(`Error in /api/monitor/${uniqueId}:`, error);
        res.status(500).json({ error: 'An unexpected error occurred.' });
    }
});

// Get notification settings
// [DEPRECATED] Per-URL notification settings endpoint — moved to global settings
app.get('/api/notification-settings/:uniqueId', authenticate, async (_req: Request, res: Response) => {
    return res.status(410).json({
        error: 'Deprecated endpoint. Use global notification settings.',
    });
});


// [DEPRECATED] Per-URL update
app.post('/api/update-notification-settings', authenticate, async (_req: Request, res: Response) => {
    return res.status(410).json({ error: 'Deprecated endpoint. Use /api/notification-settings APIs.' });
});

// Global notification settings APIs
app.get('/api/notification-settings', authenticate, async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated.' });
    try {
        const { data, error } = await supabaseServiceRole
            .from('notification_settings')
            .select('provider, is_enabled, config, created_at, updated_at')
            .eq('user_id', userId)
            .order('provider', { ascending: true });
        if (error) throw error;
        return res.status(200).json({ settings: data || [] });
    } catch (e) {
        console.error('Error fetching notification settings:', e);
        return res.status(500).json({ error: 'Failed to fetch settings.' });
    }
});

// Notification master preference APIs (disable all notifications)
app.get('/api/notification-preferences', authenticate, async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated.' });
    try {
        const { data, error } = await supabaseServiceRole
            .from('notification_preferences')
            .select('notifications_enabled, active_provider')
            .eq('user_id', userId)
            .single();
        if (error && (error as any).code !== 'PGRST116') { // not found is fine
            console.error('Error fetching notification preferences:', error);
        }
        // Default to true if no row
        const notifications_enabled = data?.notifications_enabled ?? true;
        const active_provider = data?.active_provider ?? null;
        return res.status(200).json({ notifications_enabled, active_provider });
    } catch (e) {
        console.error('Unexpected error in GET /api/notification-preferences:', e);
        return res.status(500).json({ error: 'Failed to fetch preferences.' });
    }
});

app.post('/api/notification-preferences', authenticate, async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated.' });
    const { notifications_enabled, active_provider } = req.body as { notifications_enabled?: boolean, active_provider?: 'telegram'|'slack'|'discord'|null };
    if (typeof notifications_enabled !== 'boolean' && typeof notifications_enabled !== 'undefined') {
        return res.status(400).json({ error: 'notifications_enabled must be boolean if provided' });
    }
    if (typeof active_provider !== 'undefined' && active_provider !== null && !['telegram','slack','discord'].includes(active_provider)) {
        return res.status(400).json({ error: 'active_provider must be one of telegram|slack|discord or null' });
    }
    try {
        const patch: any = { user_id: userId };
        if (typeof notifications_enabled === 'boolean') patch.notifications_enabled = notifications_enabled;
        if (typeof active_provider !== 'undefined') patch.active_provider = active_provider;
        const { data, error } = await supabaseServiceRole
            .from('notification_preferences')
            .upsert(patch, { onConflict: 'user_id' })
            .select('notifications_enabled, active_provider')
            .single();
        if (error) throw error;
        return res.status(200).json({ 
            notifications_enabled: data?.notifications_enabled ?? (typeof notifications_enabled === 'boolean' ? notifications_enabled : true),
            active_provider: data?.active_provider ?? null,
        });
    } catch (e) {
        console.error('Error upserting notification preference:', e);
        return res.status(500).json({ error: 'Failed to save preferences.' });
    }
});

app.post('/api/notification-settings/upsert', authenticate, async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated.' });
    const { provider, is_enabled, config: cfg } = req.body as { provider: 'telegram'|'slack'|'discord', is_enabled?: boolean, config?: any };
    if (!provider || !['telegram','slack','discord'].includes(provider)) {
        return res.status(400).json({ error: 'Invalid provider' });
    }
    const errs: string[] = [];
    if (provider === 'telegram') {
        if (!cfg?.bot_token) errs.push('bot_token is required');
        if (!cfg?.chat_id) errs.push('chat_id is required');
    } else if (provider === 'slack') {
        if (!cfg?.webhook_url) errs.push('webhook_url is required');
    } else if (provider === 'discord') {
        if (!cfg?.webhook_url) errs.push('webhook_url is required');
    }
    if (errs.length) return res.status(400).json({ error: errs.join(', ') });
    try {
        const { data, error } = await supabaseServiceRole
            .from('notification_settings')
            .upsert({ user_id: userId, provider, is_enabled: typeof is_enabled === 'boolean' ? is_enabled : true, config: cfg || {} }, { onConflict: 'user_id,provider' })
            .select('provider, is_enabled, config')
            .single();
        if (error) throw error;
        return res.status(200).json({ setting: data });
    } catch (e) {
        console.error('Error upserting notification setting:', e);
        return res.status(500).json({ error: 'Failed to save setting.' });
    }
});

app.delete('/api/notification-settings/:provider', authenticate, async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const { provider } = req.params as { provider: 'telegram'|'slack'|'discord' };
    if (!userId) return res.status(401).json({ error: 'User not authenticated.' });
    if (!['telegram','slack','discord'].includes(provider)) return res.status(400).json({ error: 'Invalid provider' });
    try {
        const { error } = await supabaseServiceRole
            .from('notification_settings')
            .delete()
            .eq('user_id', userId)
            .eq('provider', provider);
        if (error) throw error;
        return res.status(200).json({ message: 'Deleted' });
    } catch (e) {
        console.error('Error deleting notification setting:', e);
        return res.status(500).json({ error: 'Failed to delete setting.' });
    }
});

// Send a test notification using the user's active provider
app.post('/api/notification-settings/test', authenticate, async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'User not authenticated.' });

    try {
        // 1) Load preferences
        const { data: pref, error: prefErr } = await supabaseServiceRole
            .from('notification_preferences')
            .select('notifications_enabled, active_provider')
            .eq('user_id', userId)
            .single();
        if (prefErr && (prefErr as any).code !== 'PGRST116') {
            console.error('Failed to load notification preference:', prefErr);
        }
        const enabled = pref?.notifications_enabled ?? true;
        let provider = (pref?.active_provider ?? null) as 'telegram'|'slack'|'discord'|null;

        if (!enabled) {
            return res.status(400).json({ error: 'Notifications are disabled by global preference.' });
        }
        // 2) Allow override via request body for Send Test only
        const body = req.body as any;
        const overrideProvider = body?.provider as 'telegram'|'slack'|'discord'|undefined;
        const overrideConfig = body?.config as any | undefined;

        const message = buildTestMessage();

        if (overrideProvider) {
            if (!['telegram','slack','discord'].includes(overrideProvider)) {
                return res.status(400).json({ error: 'Invalid provider override' });
            }
            try {
                if (overrideProvider === 'telegram') {
                    const botToken = overrideConfig?.bot_token;
                    const chatId = overrideConfig?.chat_id;
                    if (!botToken || !chatId) return res.status(400).json({ error: 'Telegram bot_token and chat_id are required for test' });
                    await sendTelegram({ botToken, chatId, message });
                } else if (overrideProvider === 'slack') {
                    const webhookUrl = overrideConfig?.webhook_url;
                    if (!webhookUrl) return res.status(400).json({ error: 'Slack webhook_url is required for test' });
                    await sendSlack({ webhookUrl, message });
                } else if (overrideProvider === 'discord') {
                    const webhookUrl = overrideConfig?.webhook_url;
                    if (!webhookUrl) return res.status(400).json({ error: 'Discord webhook_url is required for test' });
                    await sendDiscord({ webhookUrl, message });
                }
            } catch (ee: any) {
                console.error(`Failed to send test via override ${overrideProvider}:`, ee?.message || ee);
                return res.status(400).json({ error: `Failed to send test via ${overrideProvider}: ${ee?.message || 'Unknown error'}` });
            }
            return res.status(200).json({ sent: true, provider: overrideProvider });
        }

        // 3) Fallback: use user's active provider from DB as before
        if (!provider) {
            return res.status(400).json({ error: 'No active provider selected. Set Alert Type first.' });
        }
        const { data: setting, error: settingError } = await supabaseServiceRole
            .from('notification_settings')
            .select('provider, is_enabled, config')
            .eq('user_id', userId)
            .eq('provider', provider)
            .single();
        if (settingError) {
            console.error('Failed to load provider setting for test:', settingError);
            return res.status(400).json({ error: 'Selected provider is not configured.' });
        }
        if (!setting?.is_enabled) {
            return res.status(400).json({ error: `Selected provider '${provider}' is disabled.` });
        }
        try {
            if (provider === 'telegram') {
                await sendTelegram({ botToken: (setting as any).config?.bot_token, chatId: (setting as any).config?.chat_id, message });
            } else if (provider === 'slack') {
                await sendSlack({ webhookUrl: (setting as any).config?.webhook_url, message });
            } else if (provider === 'discord') {
                await sendDiscord({ webhookUrl: (setting as any).config?.webhook_url, message });
            }
        } catch (ee: any) {
            console.error(`Failed to send test via ${provider}:`, ee?.message || ee);
            return res.status(400).json({ error: `Failed to send test via ${provider}: ${ee?.message || 'Unknown error'}` });
        }
        return res.status(200).json({ sent: true, provider });
    } catch (e) {
        console.error('Unexpected error in POST /api/notification-settings/test:', e);
        return res.status(500).json({ error: 'Failed to send test notification.' });
    }
});


// --- Health Check Scheduler ---

const runAllHealthChecks = async () => {
    console.log('Running periodic health checks for all active URLs...');

    // Use supabaseServiceRole to bypass RLS for fetching all URLs
    const { data: urls, error } = await supabaseServiceRole
        .from('monitored_urls')
        .select('id, user_id, target_url')
        .eq('is_active', true);

    if (error) {
        console.error('Error fetching URLs for health checks:', error);
        return;
    }

    if (!urls || urls.length === 0) {
        console.log('No active URLs to check.');
        return;
    }

    console.log(`Found ${urls.length} active URLs to check.`);

    // cache user preferences within this run to minimize queries
    const prefCache = new Map<string, { enabled: boolean, provider: 'telegram'|'slack'|'discord'|null }>();
    for (const url of urls) {
        console.log(`Checking ${url.target_url}...`);
        const result = await performHealthCheck(url.target_url);

        // Use supabaseServiceRole for inserting health checks as well
        const { error: insertError } = await supabaseServiceRole
            .from('health_checks')
            .insert({
                monitored_url_id: url.id,
                status_code: result.statusCode,
                response_time_ms: result.responseTimeMs,
                is_success: result.isSuccess,
            });
        
        if (!result.isSuccess) {
            console.log(`Health check failed for ${url.target_url}. Sending notifications (if configured)...`);
            try {
                // Check master preference first
                let pref = prefCache.get((url as any).user_id);
                if (pref === undefined) {
                    try {
                        const { data: prefRow, error: prefErr } = await supabaseServiceRole
                            .from('notification_preferences')
                            .select('notifications_enabled, active_provider')
                            .eq('user_id', (url as any).user_id)
                            .single();
                        if (prefErr && (prefErr as any).code !== 'PGRST116') {
                            console.error('Failed to load notification preference:', prefErr);
                        }
                        pref = {
                            enabled: prefRow?.notifications_enabled ?? true,
                            provider: (prefRow?.active_provider ?? null) as any,
                        };
                    } catch (ee) {
                        pref = { enabled: true, provider: null }; // default to true if unexpected error
                    }
                    prefCache.set((url as any).user_id, pref);
                }
                if (!pref.enabled) {
                    console.log('Notifications disabled by user preference; skipping dispatch.');
                    continue;
                }
                // Decide which provider to send
                let provider: 'telegram'|'slack'|'discord'|null = pref.provider;

                // Backward compatibility: if no active_provider set, but there are enabled providers, pick one by priority
                if (!provider) {
                    try {
                        const { data: enabledRows } = await supabaseServiceRole
                            .from('notification_settings')
                            .select('provider')
                            .eq('user_id', (url as any).user_id)
                            .eq('is_enabled', true);
                        const names = (enabledRows || []).map((r: any) => r.provider) as ('telegram'|'slack'|'discord')[];
                        // Widen 'names' to string[] for the includes() call to avoid TS literal-union vs string incompatibility
                        provider = (['telegram','slack','discord'].find(p => (names as string[]).includes(p)) || null) as any;
                        if (provider) {
                            console.warn(`active_provider not set; using '${provider}' by priority for user ${(url as any).user_id}`);
                        }
                    } catch {}
                }

                if (!provider) {
                    console.log('No active provider selected; skipping dispatch.');
                    continue;
                }

                // Fetch only the selected provider setting
                const { data: setting, error: settingError } = await supabaseServiceRole
                    .from('notification_settings')
                    .select('provider, is_enabled, config')
                    .eq('user_id', (url as any).user_id)
                    .eq('provider', provider)
                    .single();
                if (settingError) {
                    console.error('Failed to load selected provider setting:', settingError);
                    continue;
                }
                if (!setting?.is_enabled) {
                    console.log(`Selected provider '${provider}' is not enabled; skipping.`);
                    continue;
                }

                const message = buildOutageMessage(url.target_url);
                try {
                    if (provider === 'telegram') {
                        await sendTelegram({ botToken: (setting as any).config?.bot_token, chatId: (setting as any).config?.chat_id, message });
                    } else if (provider === 'slack') {
                        await sendSlack({ webhookUrl: (setting as any).config?.webhook_url, message });
                    } else if (provider === 'discord') {
                        await sendDiscord({ webhookUrl: (setting as any).config?.webhook_url, message });
                    }
                } catch (ee: any) {
                    console.error(`Failed to send ${provider} notification:`, ee?.message || ee);
                }
            } catch (e) {
                console.error('Notification dispatch error:', e);
            }
        }

        if (insertError) {
            console.error(`Failed to save health check for ${url.target_url}:`, insertError);
        } else {
            // Enforce retention: keep only the latest 10 checks per URL
            try {
                // Get IDs beyond the most recent 10 for this URL
                const { data: oldIds, error: oldIdsError } = await supabaseServiceRole
                    .from('health_checks')
                    .select('id')
                    .eq('monitored_url_id', url.id)
                    .order('check_time', { ascending: false })
                    // Supabase JS(Postgrest)에는 offset() 체인이 없음. 10번째 이후 레코드를 가져오기 위해 range 사용
                    // range(from, to)에서 to는 충분히 큰 값으로 설정하여 나머지를 전부 가져오도록 함
                    .range(10, 100000);

                if (!oldIdsError && oldIds && oldIds.length > 0) {
                    const ids = oldIds.map((r: any) => r.id);
                    const { error: delOldError } = await supabaseServiceRole
                        .from('health_checks')
                        .delete()
                        .in('id', ids);
                    if (delOldError) {
                        console.error(`Failed to delete old health checks for url_id=${url.id}:`, delOldError);
                    }
                }
            } catch (e) {
                console.error('Retention cleanup error:', e);
            }

            // Auto-deactivate after 3 consecutive DOWN checks
            try {
                const { data: lastThree, error: lastThreeError } = await supabaseServiceRole
                    .from('health_checks')
                    .select('is_success')
                    .eq('monitored_url_id', url.id)
                    .order('check_time', { ascending: false })
                    .range(0, 2);
                if (!lastThreeError && lastThree && lastThree.length === 3) {
                    const allDown = lastThree.every((r: any) => r.is_success === false);
                    if (allDown) {
                        const { error: deactivateError } = await supabaseServiceRole
                            .from('monitored_urls')
                            .update({ is_active: false })
                            .eq('id', url.id);
                        if (deactivateError) {
                            console.error(`Failed to auto-deactivate url_id=${url.id}:`, deactivateError);
                        } else {
                            console.log(`Auto-deactivated url_id=${url.id} after 3 consecutive DOWN checks.`);
                        }
                    }
                }
            } catch (e) {
                console.error('Auto-deactivate evaluation error:', e);
            }
        }
    }
    console.log('Finished periodic health checks.');
};


// --- Server Initialization & Health ---
// Liveness/Readiness probe
app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
});

// Helpful landing message in development (avoid "Cannot GET /")
if (config.nodeEnv !== 'production') {
    app.get('/', (_req: Request, res: Response) => {
        res.status(200).send(
            'ICU is running in development mode.<br/>' +
            'Open <a href="http://localhost:5173">http://localhost:5173</a> for the frontend (Vite).<br/>' +
            'API base: <a href="http://localhost:3000">http://localhost:3000</a><br/>' +
            'Health check: <a href="http://localhost:3000/healthz">/healthz</a>'
        );
    });
}

// Serve frontend build in production
if (config.nodeEnv === 'production') {
    const distDir = path.resolve(__dirname, '../../frontend/dist');
    app.use(express.static(distDir));
    // SPA fallback for non-API routes
    app.get(/^(?!\/api).*/, (_req: Request, res: Response) => {
        res.sendFile(path.join(distDir, 'index.html'));
    });
}

app.listen(config.serverPort, () => {
    console.log(`Server is running at http://localhost:${config.serverPort} in ${config.nodeEnv} mode`);
    
    // Start the scheduler
    setInterval(runAllHealthChecks, config.healthCheckIntervalMs);
    console.log(`Health check scheduler started. Will run every ${config.healthCheckIntervalMs / 1000} seconds.`);
    
    // Run once on startup after a short delay
    setTimeout(runAllHealthChecks, 5000); 
});
