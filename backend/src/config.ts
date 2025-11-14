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
    supabaseServiceRoleKey: string; // Add service role key
    healthCheckTimeoutMs: number;
    healthCheckIntervalMs: number;
}

const config: AppConfig = {
    nodeEnv: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    serverPort: parseInt(process.env.SERVER_PORT || '3000', 10),
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '', // Load service role key
    healthCheckTimeoutMs: parseInt(process.env.HEALTH_CHECK_TIMEOUT_MS || '5000', 10),
    healthCheckIntervalMs: parseInt(process.env.HEALTH_CHECK_INTERVAL_MS || '60000', 10),
};

// Validate that essential variables are loaded
if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new Error("Supabase URL and Service Role Key must be provided in environment variables.");
}

// Freeze the object to prevent modifications
export default Object.freeze(config);
