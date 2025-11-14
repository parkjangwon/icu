import config from '../config';

interface HealthCheckResult {
    statusCode: number | null;
    responseTimeMs: number | null;
    isSuccess: boolean;
    error?: string;
}

export async function performHealthCheck(targetUrl: string): Promise<HealthCheckResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.healthCheckTimeoutMs);

    const startTime = Date.now();

    try {
        const response = await fetch(targetUrl, {
            signal: controller.signal,
            redirect: 'follow', // Handle redirects
        });

        const responseTimeMs = Date.now() - startTime;

        return {
            statusCode: response.status,
            responseTimeMs,
            isSuccess: response.ok, // True for status codes 200-299
        };
    } catch (error: any) {
        const responseTimeMs = Date.now() - startTime;
        
        let errorMessage = 'Unknown error';
        if (error.name === 'AbortError') {
            errorMessage = `Request timed out after ${config.healthCheckTimeoutMs}ms`;
        } else if (error instanceof Error) {
            errorMessage = error.message;
        }

        return {
            statusCode: null,
            responseTimeMs,
            isSuccess: false,
            error: errorMessage,
        };
    } finally {
        clearTimeout(timeoutId);
    }
}
