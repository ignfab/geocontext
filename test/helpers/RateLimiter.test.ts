import { RateLimiter } from "../../src/helpers/RateLimiter.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Test RateLimiter", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("should allow up to N requests in the same second", async () => {
        const limiter = new RateLimiter({
            name: "test",
            maxCalls: 2,
            period: 1,
        });

        await expect(limiter.limit()).resolves.toBeUndefined();
        await expect(limiter.limit()).resolves.toBeUndefined();
    });

    it("should throw on request N+1 in the same rolling second", async () => {
        const limiter = new RateLimiter({
            name: "test",
            maxCalls: 2,
            period: 1,
        });

        await limiter.limit();
        await limiter.limit();

        await expect(limiter.limit()).rejects.toThrow("[test] Rate limit exceeded");
    });

    it("should allow a new request after the one-second window slides", async () => {
        const limiter = new RateLimiter({
            name: "test",
            maxCalls: 2,
            period: 1,
        });

        await limiter.limit();
        await limiter.limit();

        vi.setSystemTime(new Date("2026-01-01T00:00:01.000Z"));

        await expect(limiter.limit()).resolves.toBeUndefined();
    });

    it("should reject invalid maxCalls values", () => {
        expect(() => new RateLimiter({
            name: "zero",
            maxCalls: 0,
            period: 1,
        })).toThrow();

        expect(() => new RateLimiter({
            name: "negative",
            maxCalls: -1,
            period: 1,
        })).toThrow();

        expect(() => new RateLimiter({
            name: "nan",
            maxCalls: Number.NaN,
            period: 1,
        })).toThrow();

        expect(() => new RateLimiter({
            name: "infinite",
            maxCalls: Number.POSITIVE_INFINITY,
            period: 1,
        })).toThrow();

        expect(() => new RateLimiter({
            name: "fractional",
            maxCalls: 1.5,
            period: 1,
        })).toThrow();
    });

    it("should reject invalid period values", () => {
        expect(() => new RateLimiter({
            name: "zero",
            maxCalls: 1,
            period: 0,
        })).toThrow();

        expect(() => new RateLimiter({
            name: "negative",
            maxCalls: 1,
            period: -1,
        })).toThrow();

        expect(() => new RateLimiter({
            name: "nan",
            maxCalls: 1,
            period: Number.NaN,
        })).toThrow();

        expect(() => new RateLimiter({
            name: "infinite",
            maxCalls: 1,
            period: Number.POSITIVE_INFINITY,
        })).toThrow();
    });

    it("should enforce boundary at exactly one second", async () => {
        const limiter = new RateLimiter({
            name: "test",
            maxCalls: 1,
            period: 1,
        });

        await limiter.limit();

        vi.setSystemTime(new Date("2026-01-01T00:00:00.999Z"));
        await expect(limiter.limit()).rejects.toThrow("[test] Rate limit exceeded");

        vi.setSystemTime(new Date("2026-01-01T00:00:01.000Z"));
        await expect(limiter.limit()).resolves.toBeUndefined();
    });

    it("should honor a custom period in seconds", async () => {
        const limiter = new RateLimiter({
            name: "test",
            maxCalls: 2,
            period: 2,
        });

        await limiter.limit();
        await limiter.limit();

        vi.setSystemTime(new Date("2026-01-01T00:00:01.999Z"));
        await expect(limiter.limit()).rejects.toThrow("[test] Rate limit exceeded");

        vi.setSystemTime(new Date("2026-01-01T00:00:02.000Z"));
        await expect(limiter.limit()).resolves.toBeUndefined();
    });
});
