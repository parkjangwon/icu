import dotenv from 'dotenv';
import path from 'path';

// Determine which .env file to load
const envFile = process.env.NODE_ENV === 'production' 
    ? '.env.production' 
    : '.env.development';

// Load the environment variables from the correct file
const result = dotenv.config({ path: path.resolve(__dirname, '..', envFile) });

if (result.error) {
    // In a real app, you might want to throw an error if the env file is missing,
    // but for development, we can allow it to proceed if variables are set externally.
    console.warn(`Could not find ${envFile} file. Make sure environment variables are set.`);
}

// Type-safe configuration object
interface AppConfig {
    nodeEnv: 'development' | 'production';
    serverPort: number;
    supabaseUrl: string;
    supabaseAnonKey: string; // Add anon key for JWT verification
    supabaseServiceRoleKey: string; // Add service role key
    healthCheckTimeoutMs: number;
    healthCheckIntervalMs: number;
    healthCheckDebug: boolean;
    healthCheckUserAgent: string;
    // Advanced health check knobs
    healthCheckUseIpv4First: boolean;
    healthCheckAllowedStatusCodes: string; // e.g. "200-299,401,403"
    healthCheckAccept: string;
    healthCheckAcceptLanguage: string;
    healthCheckAcceptEncoding: string;
    healthCheckMethodOrder: string; // e.g. "GET,HEAD"
    // When HEAD is not supported, try the next method (e.g., GET) if status is in this list
    healthCheckHeadFallbackStatuses: string; // e.g. "405,501"
}

const config: AppConfig = {
    nodeEnv: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    serverPort: parseInt(process.env.SERVER_PORT || '3000', 10),
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '', // Load service role key
    healthCheckTimeoutMs: parseInt(process.env.HEALTH_CHECK_TIMEOUT_MS || '5000', 10),
    healthCheckIntervalMs: parseInt(process.env.HEALTH_CHECK_INTERVAL_MS || '60000', 10),
    healthCheckDebug: (() => {
        const v = (process.env.HEALTHCHECK_DEBUG || '').toLowerCase();
        if (!v) return process.env.NODE_ENV !== 'production';
        return v === '1' || v === 'true' || v === 'yes';
    })(),
    healthCheckUserAgent: process.env.HEALTHCHECK_UA || 'ICU-Monitor/1.0 (+https://icu.local)',
    healthCheckUseIpv4First: (() => {
        const v = (process.env.HEALTHCHECK_USE_IPV4_FIRST || '').toLowerCase();
        return v === '1' || v === 'true' || v === 'yes';
    })(),
    healthCheckAllowedStatusCodes: process.env.HEALTHCHECK_ALLOWED_STATUS_CODES || '200-299',
    healthCheckAccept: process.env.HEALTHCHECK_ACCEPT || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    healthCheckAcceptLanguage: process.env.HEALTHCHECK_ACCEPT_LANGUAGE || 'en-US,en;q=0.9',
    healthCheckAcceptEncoding: process.env.HEALTHCHECK_ACCEPT_ENCODING || 'gzip, deflate, br',
    healthCheckMethodOrder: process.env.HEALTHCHECK_METHOD_ORDER || 'GET,HEAD',
    healthCheckHeadFallbackStatuses: process.env.HEALTHCHECK_HEAD_FALLBACK_STATUSES || '405,501',
};

// Validate that essential variables are loaded
if (!config.supabaseUrl || !config.supabaseAnonKey || !config.supabaseServiceRoleKey) {
    throw new Error("Supabase URL, Anon Key, and Service Role Key must be provided in environment variables.");
}

// Freeze the object to prevent modifications
export default Object.freeze(config);
