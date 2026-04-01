// --- Imports ---

import {
    Collection,
    getCollectionCatalog,
    MiniSearchCollectionSearchEngine,
    MiniSearchCollectionSearchEngineOptions,
} from '@ignfab/gpf-schema-store';

// --- Constants ---

export const GPF_WFS_URL = "https://data.geopf.fr/wfs";

// Environment variable used to inject search engine options at runtime (JSON string).
const GPF_WFS_SEARCH_OPTIONS_ENV = "GPF_WFS_SEARCH_OPTIONS";

// Keys accepted at the top level of the search options object.
const TOP_LEVEL_SEARCH_OPTION_KEYS = ["fuzzy", "boost"] as const;

// Keys accepted inside the nested `boost` object.
const BOOST_SEARCH_OPTION_KEYS = [
    "namespace",
    "name",
    "title",
    "description",
    "properties",
] as const;

// --- Types ---

type BoostSearchOptionKey = typeof BOOST_SEARCH_OPTION_KEYS[number];

// --- Errors ---

export class FeatureTypeNotFoundError extends Error {
    constructor(name: string) {
        super(`Type '${name}' not found`);
    }
}

// --- Helpers ---

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function invalidSearchOptionsError(reason: string): Error {
    return new Error(`Invalid ${GPF_WFS_SEARCH_OPTIONS_ENV}: ${reason}`);
}

// --- Search options parsing ---

// Parses and validates a plain-object value into MiniSearchCollectionSearchEngineOptions.
// Throws a descriptive error if the value has unexpected keys or wrong value types.
function parseSearchOptions(value: unknown): MiniSearchCollectionSearchEngineOptions {
    if (!isPlainObject(value)) {
        throw invalidSearchOptionsError("expected a JSON object");
    }

    for (const key of Object.keys(value)) {
        if (!TOP_LEVEL_SEARCH_OPTION_KEYS.includes(key as typeof TOP_LEVEL_SEARCH_OPTION_KEYS[number])) {
            throw invalidSearchOptionsError(`unexpected key '${key}'`);
        }
    }

    const options: MiniSearchCollectionSearchEngineOptions = {};

    if (value.fuzzy !== undefined) {
        if (!isFiniteNumber(value.fuzzy)) {
            throw invalidSearchOptionsError("expected 'fuzzy' to be a finite number");
        }
        options.fuzzy = value.fuzzy;
    }

    if (value.boost !== undefined) {
        if (!isPlainObject(value.boost)) {
            throw invalidSearchOptionsError("expected 'boost' to be an object");
        }

        const boost: Partial<Record<BoostSearchOptionKey, number>> = {};
        for (const key of Object.keys(value.boost)) {
            if (!BOOST_SEARCH_OPTION_KEYS.includes(key as BoostSearchOptionKey)) {
                throw invalidSearchOptionsError(`unexpected key 'boost.${key}'`);
            }
            const rawScore = value.boost[key];
            if (!isFiniteNumber(rawScore)) {
                throw invalidSearchOptionsError(`expected 'boost.${key}' to be a finite number`);
            }
            boost[key as BoostSearchOptionKey] = rawScore;
        }
        options.boost = boost;
    }

    return options;
}

// Reads search options from the GPF_WFS_SEARCH_OPTIONS environment variable.
// Returns undefined when the variable is absent or empty.
export function loadSearchOptionsFromEnv(): MiniSearchCollectionSearchEngineOptions | undefined {
    const rawValue = process.env[GPF_WFS_SEARCH_OPTIONS_ENV];
    if (!rawValue || rawValue.trim() === "") {
        return undefined;
    }

    let parsedValue: unknown;
    try {
        parsedValue = JSON.parse(rawValue);
    } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : "unknown JSON parse error";
        throw invalidSearchOptionsError(`expected valid JSON (${reason})`);
    }

    return parseSearchOptions(parsedValue);
}

// --- WFS client ---

export class WfsClient {

    private readonly catalog;

    constructor(
        public baseUrl: string = GPF_WFS_URL,
        options: { search?: MiniSearchCollectionSearchEngineOptions } = {},
    ) {
        this.catalog = getCollectionCatalog({
            engineFactory: (items) => new MiniSearchCollectionSearchEngine(items, options.search),
        });
    }

    async getFeatureTypes(): Promise<Collection[]> {
        return this.catalog.list();
    }

    async searchFeatureTypes(query: string, maxResults: number = 20): Promise<Collection[]> {
        return this.catalog.search(query, {
            limit: maxResults,
            combineWith: 'AND',
        });
    }

    async getFeatureType(name: string): Promise<Collection> {
        const featureType = this.catalog.getById(name);
        if (featureType) {
            return featureType;
        }
        throw new FeatureTypeNotFoundError(name);
    }

}

// --- Default singleton ---

// Pre-configured client using the default GPF endpoint and optional env-based search options.
export const wfsClient = new WfsClient(undefined, {
    search: loadSearchOptionsFromEnv(),
});
