/**
 * Parameters for the RateLimiter class inspired by https://pypi.org/project/ratelimiter/
 */
interface RateLimiterOptions {
    /**
     * The name of the rate limiter, used for error reporting and debugging purposes.
     */
    name: string;
    /**
     * The maximum number of calls allowed during one period.
     */
    maxCalls: number;
    /**
     * The period duration in seconds.
     */
    period: number;
}

/**
 * An helper class to limit the number of requests over a configurable period.
 * It is intented to avoid over loading backend services with too many requests 
 * in a short period of time.
 * 
 * When the limit is reached, an Error is thrown with the message "Rate limit exceeded".
 */
export class RateLimiter {
    private name: string;
    private maxCalls: number;
    private periodMs: number;
    private periodStartMs: number | null;
    private requestsInPeriod: number;

    constructor(options: RateLimiterOptions) {
        if (!Number.isFinite(options.maxCalls) || !Number.isInteger(options.maxCalls) || options.maxCalls <= 0) {
            throw new Error(`Invalid maxCalls for limiter ${options.name}`);
        }

        if (!Number.isFinite(options.period) || options.period <= 0) {
            throw new Error(`Invalid period for limiter ${options.name}`);
        }

        this.name = options.name;
        this.maxCalls = options.maxCalls;
        this.periodMs = options.period * 1000;
        this.periodStartMs = null;
        this.requestsInPeriod = 0;
    }

    public async limit(): Promise<void> {
        const now = Date.now();

        // Reset the counter when entering a new period window.
        if (this.periodStartMs === null || now - this.periodStartMs >= this.periodMs) {
            this.periodStartMs = now;
            this.requestsInPeriod = 0;
        }

        if (this.requestsInPeriod >= this.maxCalls) {
            throw new Error(`[${this.name}] Rate limit exceeded`);
        }

        this.requestsInPeriod += 1;
    }

}

/**
 * Helper function to create a RateLimiter instance with the given parameters.
 * This is just a convenience function to avoid having to import the RateLimiter class.
 * 
 * @param name 
 * @param maxCalls 
 * @param period 
 * @returns 
 */
export function createRateLimiter(name: string, maxCalls: number, period: number): RateLimiter {
    return new RateLimiter({ name, maxCalls, period });
}
