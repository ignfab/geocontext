import { z } from "zod";

// --- Helpers ---

/** Treats empty/whitespace-only strings as undefined (same as `val?.trim() || default` pattern). */
const emptyToUndefined = (val: unknown) =>
    (typeof val === "string" && val.trim() === "") ? undefined : val;

function parseJsonEnvValue(val: string, ctx: z.RefinementCtx): unknown {
    if (val === "") {
        return undefined;
    }

    try {
        return JSON.parse(val) as unknown;
    } catch (e) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Invalid JSON: ${e instanceof Error ? e.message : "unknown parse error"}`,
        });
        return z.NEVER;
    }
}

// --- Reusable Schemas ---

const portSchema = z.coerce
    .number()
    .int()
    .min(1, "Expected a port between 1 and 65535")
    .max(65535, "Expected a port between 1 and 65535");

const positiveNumberSchema = z.coerce
    .number()
    .positive();

const positiveIntegerSchema = z.coerce
    .number()
    .int()
    .positive();

// --- Enums ---

const transportTypes = ["stdio", "http"] as const;
const logLevels = ["error", "warn", "info", "http", "verbose", "debug", "silly"] as const;
const logFormats = ["json", "simple"] as const;
const nodeEnvs = ["development", "test", "production"] as const;

// --- Env Schema ---

const envSchema = z.object({
    // Transport
    TRANSPORT_TYPE: z.enum(transportTypes).default("stdio"),
    // HTTP transport options
    HTTP_HOST: z.preprocess(emptyToUndefined, z.string().trim().default("127.0.0.1")),
    HTTP_PORT: z.preprocess(emptyToUndefined, portSchema.default(3000)),
    HTTP_MCP_ENDPOINT: z.preprocess(
        emptyToUndefined,
        z
            .string()
            .trim()
            .regex(/^\/(?!\/)[^?#]*$/, "Expected a path like /mcp, without query or fragment")
            .default("/mcp"),
    ),
    HTTP_CORS_ALLOWED_ORIGINS: z
        .string()
        .transform((val) => {
            const origins = val
                .split(",")
                .map((o) => o.trim())
                .filter((o) => o.length > 0);
            return origins.length > 0 ? origins : undefined;
        })
        // Intentionally not validating origin syntax: 
        // values are passed through to the HTTP transport layer.
        .pipe(z.array(z.string()).min(1).optional())
        .optional(),
    // Logging
    LOG_LEVEL: z.preprocess(emptyToUndefined, z.enum(logLevels).default("debug")),
    LOG_FORMAT: z.preprocess(emptyToUndefined, z.enum(logFormats).default("simple")),
    NODE_ENV: z.preprocess(emptyToUndefined, z.enum(nodeEnvs).default("development")),
    // HTTP client
    USER_AGENT: z.preprocess(emptyToUndefined, z.string().trim().default("geocontext")),
    HTTP_TIMEOUT: z.preprocess(emptyToUndefined, positiveNumberSchema.default(15)),
    // GPF rate limits
    GPF_WFS_RATE_LIMIT: z.preprocess(emptyToUndefined, positiveIntegerSchema.default(30)),
    GPF_GEOCODE_RATE_LIMIT: z.preprocess(emptyToUndefined, positiveIntegerSchema.default(50)),
    GPF_ALTI_RATE_LIMIT: z.preprocess(emptyToUndefined, positiveIntegerSchema.default(50)),
    // GPF WFS
    GPF_WFS_MINISEARCH_OPTIONS: z
        .string()
        .trim()
        .transform(parseJsonEnvValue)
        .pipe(z.record(z.string(), z.unknown()).optional())
        .optional(),
});

// --- Parsing ---

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
    const result = envSchema.safeParse(source);

    if (!result.success) {
        const formatted = result.error.issues
            .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
            .join("\n");
        throw new Error(`Invalid environment configuration:\n${formatted}`);
    }

    return result.data;
}

// --- Singleton ---

let cachedEnv: Env | undefined;

/**
 * Returns the validated environment, parsing it on first access.
 * Throws on invalid configuration.
 */
export function getEnv(): Env {
    cachedEnv ??= parseEnv();
    return cachedEnv;
}

/**
 * Reset the cached environment (useful for tests).
 */
export function resetEnv(): void {
    cachedEnv = undefined;
}
