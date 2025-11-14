/// <reference path="./types/express.d.ts" />

// This must be the first import to ensure environment variables are loaded
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { supabase, supabaseServiceRole } from './supabaseClient';
import { nanoid } from 'nanoid';
import { performHealthCheck } from './utils/healthChecker';
import axios from 'axios';
import config from './config';

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

// --- API Endpoints ---

// Get user's monitored URLs
app.get('/api/urls', authenticate, async (req: Request, res: Response) => {
    const userId = req.user?.id;

    if (!userId) {
        return res.status(401).json({ error: 'User not authenticated.' });
    }

    try {
        const { data: urls, error } = await supabase
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
        const { data: urlData, error: urlError } = await supabase
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
        const { error: delUrlError } = await supabase
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
        const { data: urlData, error: urlError } = await supabase
            .from('monitored_urls')
            .select('id, is_active')
            .eq('unique_id', uniqueId)
            .eq('user_id', userId)
            .single();

        if (urlError || !urlData) {
            return res.status(404).json({ error: 'URL not found or not authorized.' });
        }

        const nextValue = typeof is_active === 'boolean' ? is_active : !urlData.is_active;

        const { data: updated, error: updateError } = await supabase
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
                const result = await performHealthCheck((await supabase
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
        const { count: userUrlCount, error: countError } = await supabase
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
            const result = await performHealthCheck(url);
            if (!result.isSuccess) {
                return res.status(400).json({
                    error: 'Unable to connect to the specified URL. Please ensure the URL is up and running.',
                    details: {
                        statusCode: result.statusCode,
                        responseTimeMs: result.responseTimeMs,
                    },
                });
            }
        } catch (e) {
            // Even if performHealthCheck throws, respond with a user-friendly connectivity message
            return res.status(400).json({ error: 'Unable to connect to the specified URL. Please ensure the URL is up and running.' });
        }

        // 2) Insert into DB
        const unique_id = nanoid(32); // Increased nanoid length to 32

        const { data, error } = await supabase
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
        const { data: urlData, error: urlError } = await supabase
            .from('monitored_urls')
            .select('id, target_url, is_active, notification_type, email, webhook_url, webhook_method, webhook_headers')
            .eq('unique_id', uniqueId)
            .eq('user_id', userId) // Filter by user_id
            .single();

        if (urlError || !urlData) {
            return res.status(404).json({ error: 'Monitoring ID not found or not authorized.' });
        }

        // 2. Get recent health_checks for the url (DB keeps only latest 10, but we still limit here)
        const { data: healthChecks, error: checksError } = await supabase
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
app.get('/api/notification-settings/:uniqueId', authenticate, async (req: Request, res: Response) => {
    const { uniqueId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
        return res.status(401).json({ error: 'User not authenticated.' });
    }

    if (!uniqueId) {
        return res.status(400).json({ error: 'A unique ID is required.' });
    }

    try {
        const { data, error } = await supabase
            .from('monitored_urls')
            .select('notification_type, email, webhook_url, webhook_method, webhook_headers')
            .eq('unique_id', uniqueId)
            .eq('user_id', userId) // Filter by user_id
            .single();

        if (error || !data) {
            return res.status(404).json({ error: 'Monitoring ID not found or not authorized.' });
        }

        res.status(200).json({
            notificationType: data.notification_type,
            email: data.email,
            webhookUrl: data.webhook_url,
            webhookMethod: data.webhook_method,
            webhookHeaders: data.webhook_headers,
        });
    } catch (error) {
        console.error(`Error in /api/notification-settings/${uniqueId}:`, error);
        res.status(500).json({ error: 'An unexpected error occurred.' });
    }
});


// Update notification settings
app.post('/api/update-notification-settings', authenticate, async (req: Request, res: Response) => {
    const { uniqueId, notificationType, email, webhookUrl, webhookMethod, webhookHeaders } = req.body;
    const userId = req.user?.id;

    if (!userId) {
        return res.status(401).json({ error: 'User not authenticated.' });
    }

    if (!uniqueId) {
        return res.status(400).json({ error: 'uniqueId is required.' });
    }

    const updateData: any = {
        notification_type: notificationType,
        email: null,
        webhook_url: null,
        webhook_method: null,
        webhook_headers: null,
    };

    if (notificationType === 'email') {
        if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
            return res.status(400).json({ error: 'A valid email is required for email notifications.' });
        }
        updateData.email = email;
    } else if (notificationType === 'webhook') {
        if (!webhookUrl || !isValidUrl(webhookUrl)) {
            return res.status(400).json({ error: 'A valid webhook URL is required for webhook notifications.' });
        }
        updateData.webhook_url = webhookUrl;
        updateData.webhook_method = webhookMethod || 'POST';
        // Validate webhookHeaders to be a plain object
        if (webhookHeaders && typeof webhookHeaders === 'object' && !Array.isArray(webhookHeaders)) {
            updateData.webhook_headers = webhookHeaders;
        } else if (webhookHeaders) {
            return res.status(400).json({ error: 'Webhook headers must be a valid JSON object.' });
        } else {
            updateData.webhook_headers = {};
        }
    } else {
        return res.status(400).json({ error: 'Invalid notification type.' });
    }

    try {
        const { data, error } = await supabase
            .from('monitored_urls')
            .update(updateData)
            .eq('unique_id', uniqueId)
            .eq('user_id', userId) // Filter by user_id
            .select()
            .single();

        if (error || !data) {
            return res.status(404).json({ error: 'Monitoring ID not found or not authorized.' });
        }

        res.status(200).json({ message: 'Notification settings updated successfully.' });

    } catch (error) {
        console.error('Error updating notification settings:', error);
        res.status(500).json({ error: 'An unexpected error occurred.' });
    }
});


// --- Health Check Scheduler ---

const runAllHealthChecks = async () => {
    console.log('Running periodic health checks for all active URLs...');

    // Use supabaseServiceRole to bypass RLS for fetching all URLs
    const { data: urls, error } = await supabaseServiceRole
        .from('monitored_urls')
        .select('id, target_url, notification_type, webhook_url, webhook_method, webhook_headers, email')
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
            console.log(`Health check failed for ${url.target_url}. Sending notification...`);
            if (url.notification_type === 'webhook' && url.webhook_url) {
                try {
                    await axios({
                        method: url.webhook_method,
                        url: url.webhook_url,
                        headers: url.webhook_headers,
                        data: {
                            message: `Health check failed for ${url.target_url}. Status code: ${result.statusCode}`,
                            url: url.target_url,
                            statusCode: result.statusCode,
                            responseTimeMs: result.responseTimeMs,
                        }
                    });
                    console.log(`Webhook notification sent for ${url.target_url}`);
                } catch (e: any) {
                    console.error(`Failed to send webhook notification for ${url.target_url}:`, e.message);
                }
            } else if (url.notification_type === 'email' && url.email) {
                // Email sending logic is not implemented in this demo
                console.log(`Email notification for ${url.target_url} to ${url.email} is not implemented.`);
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


// --- Server Initialization ---
app.get('/', (req: Request, res: Response) => {
    res.send(`ICU Backend is running in ${config.nodeEnv} mode.`);
});

app.listen(config.serverPort, () => {
    console.log(`Server is running at http://localhost:${config.serverPort} in ${config.nodeEnv} mode`);
    
    // Start the scheduler
    setInterval(runAllHealthChecks, config.healthCheckIntervalMs);
    console.log(`Health check scheduler started. Will run every ${config.healthCheckIntervalMs / 1000} seconds.`);
    
    // Run once on startup after a short delay
    setTimeout(runAllHealthChecks, 5000); 
});
