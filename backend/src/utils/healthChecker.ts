import config from '../config';
import * as dns from 'dns';
import { Agent, Dispatcher } from 'undici';
import { LookupFunction } from 'net';

export interface HealthCheckResult {
    statusCode: number | null;
    responseTimeMs: number | null;
    isSuccess: boolean;
    error?: string;
    checkTime?: string; // Added to be compatible with history cache
    // optional extra diagnostics for network/TLS errors
    errorDetails?: {
        name?: string;
        code?: any;
        errno?: any;
        syscall?: any;
        hostname?: any;
        address?: any;
        port?: any;
        causeCode?: any;
        causeErrno?: any;
        causeSyscall?: any;
        causeHostname?: any;
        causeAddress?: any;
        causePort?: any;
    };
}

// parse allowed status codes string like "200-299,401,403"
function parseAllowedStatus(spec: string): (status: number) => boolean {
    const parts = spec.split(',').map(s => s.trim()).filter(Boolean);
    const singles = new Set<number>();
    const ranges: Array<{ min: number; max: number }> = [];
    for (const p of parts) {
        const m = p.match(/^(\d{3})\s*-\s*(\d{3})$/);
        if (m) {
            ranges.push({ min: parseInt(m[1], 10), max: parseInt(m[2], 10) });
        } else if (/^\d{3}$/.test(p)) {
            singles.add(parseInt(p, 10));
        }
    }
    return (status: number) => singles.has(status) || ranges.some(r => status >= r.min && status <= r.max);
}

const isAllowedStatus = parseAllowedStatus(config.healthCheckAllowedStatusCodes);
// parse CSV of statuses into a Set<number>, e.g. "405,501"
function parseStatusCsvToSet(spec: string): Set<number> {
    const set = new Set<number>();
    if (!spec) return set;
    for (const part of spec.split(',').map(s => s.trim()).filter(Boolean)) {
        const n = parseInt(part, 10);
        if (!Number.isNaN(n)) set.add(n);
    }
    return set;
}
const headFallbackStatuses = parseStatusCsvToSet(config.healthCheckHeadFallbackStatuses);

let envLoggedOnce = false;

// Prepare dispatchers
const defaultAgent = new Agent({});
const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });

// custom IPv4-only lookup to avoid IPv6 paths
const ipv4Lookup: LookupFunction = (hostname: string, options: any, callback: any) => {
    if (typeof options === 'function') {
        callback = options;
    }
    (dns as any).lookup(hostname, { family: 4 }, callback);
};

const ipv4Agent = new Agent({ connect: { lookup: ipv4Lookup as any } });
const ipv4InsecureAgent = new Agent({ connect: { lookup: ipv4Lookup as any, rejectUnauthorized: false } });

function pickDispatcher(preferIpv4: boolean, insecure: boolean): Dispatcher {
    // We intentionally ignore the "secure" path and ALWAYS use insecure agents
    // to skip TLS certificate verification, as per product requirements.
    if (preferIpv4) return ipv4InsecureAgent;
    return insecureAgent;
}

export async function performHealthCheck(targetUrl: string): Promise<HealthCheckResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.healthCheckTimeoutMs);

    const startTime = Date.now();

    try {
        if (!envLoggedOnce && config.healthCheckDebug) {
            envLoggedOnce = true;
            try {
                // optionally influence DNS answer order
                if (config.healthCheckUseIpv4First && (dns as any).setDefaultResultOrder) {
                    try { (dns as any).setDefaultResultOrder('ipv4first'); } catch {}
                }
                console.debug('[HealthCheck] ENV', {
                    node: process.version,
                    platform: process.platform,
                    arch: process.arch,
                    methodOrder: config.healthCheckMethodOrder,
                    allowedStatuses: config.healthCheckAllowedStatusCodes,
                    headFallbackStatuses: config.healthCheckHeadFallbackStatuses,
                    ipv4First: config.healthCheckUseIpv4First,
                });
            } catch {}
        }

        if (config.healthCheckDebug) {
            console.debug('[HealthCheck] START', {
                url: targetUrl,
                timeoutMs: config.healthCheckTimeoutMs,
                ua: config.healthCheckUserAgent,
            });
        }
        const methods = config.healthCheckMethodOrder.split(',').map(m => m.trim().toUpperCase()).filter(Boolean);
        const headers: Record<string, string> = {
            'User-Agent': config.healthCheckUserAgent,
            'Accept': config.healthCheckAccept,
            'Accept-Language': config.healthCheckAcceptLanguage,
            'Accept-Encoding': config.healthCheckAcceptEncoding,
            'Connection': 'keep-alive',
        };

        let lastError: any = null;
        // Two dispatcher passes: default first, optional IPv4 fallback on network error
        const dispatcherOrder: Dispatcher[] = [
            pickDispatcher(false, true),
            pickDispatcher(config.healthCheckUseIpv4First, true),
        ];

        for (const dispatcher of dispatcherOrder) {
            for (const method of methods) {
                try {
                    const response = await fetch(targetUrl, {
                        method,
                        signal: controller.signal,
                        redirect: 'follow',
                        headers,
                        dispatcher,
                    } as any);

                    const responseTimeMs = Date.now() - startTime;

                    if (config.healthCheckDebug) {
                        const debugHeaders: Record<string, string> = {};
                        const interesting = ['server', 'cf-ray', 'cf-cache-status', 'via', 'x-powered-by', 'content-type'];
                        for (const name of interesting) {
                            const v = response.headers.get(name);
                            if (v) debugHeaders[name] = v;
                        }
                        const allowed = isAllowedStatus(response.status);
                        console.debug('[HealthCheck] RESPONSE', {
                            url: targetUrl,
                            method,
                            status: response.status,
                            ok: response.ok,
                            allowed,
                            responseTimeMs,
                            headers: debugHeaders,
                        });
                        // If HEAD not supported (e.g., 405/501), try next method (usually GET)
                        if (!allowed && method === 'HEAD' && headFallbackStatuses.has(response.status)) {
                            console.debug('[HealthCheck] HEAD not supported; falling back to next method', {
                                status: response.status,
                            });
                        }
                    }

                    const allowed = isAllowedStatus(response.status);
                    if (allowed) {
                        return {
                            statusCode: response.status,
                            responseTimeMs,
                            isSuccess: true,
                        };
                    }
                    // If this was a HEAD and it returned a status that indicates "method not supported",
                    // do NOT short-circuit — try the next method (e.g., GET)
                    if (method === 'HEAD' && headFallbackStatuses.has(response.status)) {
                        // continue to next attempt
                        continue;
                    }
                    // Otherwise, return immediately with not-allowed status
                    return {
                        statusCode: response.status,
                        responseTimeMs,
                        isSuccess: false,
                    };
                } catch (e: any) {
                    lastError = e;
                    if (config.healthCheckDebug) {
                        console.debug('[HealthCheck] ATTEMPT ERROR', {
                            url: targetUrl,
                            method,
                            name: e?.name,
                            code: (e as any)?.code,
                            message: (e as Error)?.message,
                            cause: e?.cause ? {
                                code: e?.cause?.code,
                                errno: e?.cause?.errno,
                                syscall: e?.cause?.syscall,
                                hostname: e?.cause?.hostname,
                                address: e?.cause?.address,
                                port: e?.cause?.port,
                            } : undefined,
                        });
                    }
                    // continue to next attempt
                }
            }
        }

        // all attempts failed with an exception
        const responseTimeMs = Date.now() - startTime;
        const details = buildErrorDetails(lastError);
        if (config.healthCheckDebug) {
            console.debug('[HealthCheck] ERROR', {
                url: targetUrl,
                responseTimeMs,
                ...details,
                type: typeof lastError,
            });
        }
        return {
            statusCode: null,
            responseTimeMs,
            isSuccess: false,
            error: (lastError as Error)?.message || 'Unknown error',
            errorDetails: details,
        };
    } catch (error: any) {
        const responseTimeMs = Date.now() - startTime;
        
        let errorMessage = 'Unknown error';
        if (error.name === 'AbortError') {
            errorMessage = `Request timed out after ${config.healthCheckTimeoutMs}ms`;
        } else if (error instanceof Error) {
            errorMessage = error.message;
        }

        if (config.healthCheckDebug) {
            console.debug('[HealthCheck] ERROR', {
                url: targetUrl,
                responseTimeMs,
                name: error?.name,
                code: error?.code,
                message: errorMessage,
                type: typeof error,
            });
        }

        return {
            statusCode: null,
            responseTimeMs,
            isSuccess: false,
            error: errorMessage,
            errorDetails: buildErrorDetails(error),
        };
    } finally {
        clearTimeout(timeoutId);
    }
}

function buildErrorDetails(err: any) {
    return {
        name: err?.name,
        code: err?.code,
        errno: err?.errno,
        syscall: err?.syscall,
        hostname: err?.hostname,
        address: err?.address,
        port: err?.port,
        causeCode: err?.cause?.code,
        causeErrno: err?.cause?.errno,
        causeSyscall: err?.cause?.syscall,
        causeHostname: err?.cause?.hostname,
        causeAddress: err?.cause?.address,
        causePort: err?.cause?.port,
    };
}
