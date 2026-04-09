// --- Imports ---

import {
    Collection,
    CollectionSearchResult,
    getCollectionCatalog,
    MiniSearchCollectionSearchEngine,
    MiniSearchCollectionSearchOptions,
} from '@ignfab/gpf-schema-store';

// --- Constants ---

export const GPF_WFS_URL = "https://data.geopf.fr/wfs";

// Environment variable used to inject MiniSearch options at runtime (JSON string).
const GPF_WFS_MINISEARCH_OPTIONS_ENV = "GPF_WFS_MINISEARCH_OPTIONS";

// Keys accepted at the top level of the search options object.
const TOP_LEVEL_MINISEARCH_OPTION_KEYS = ["fields", "combineWith", "fuzzy", "boost"] as const;

// Shared keys used by both `fields` and `boost` in MiniSearchCollectionSearchOptions.
const MINISEARCH_INDEXED_OPTION_KEYS = [
    "namespace",
    "name",
    "title",
    "description",
    "properties",
    "enums",
    "identifierTokens",
] as const;

const MINISEARCH_FIELD_OPTION_KEYS = MINISEARCH_INDEXED_OPTION_KEYS;
const MINISEARCH_COMBINE_WITH_VALUES = ["AND", "OR"] as const;
const MINISEARCH_BOOST_OPTION_KEYS = MINISEARCH_INDEXED_OPTION_KEYS;

// --- Types ---

type MiniSearchFieldOptionKey = typeof MINISEARCH_FIELD_OPTION_KEYS[number];
type MiniSearchBoostOptionKey = typeof MINISEARCH_BOOST_OPTION_KEYS[number];
type MiniSearchOptions = MiniSearchCollectionSearchOptions;

// --- Errors ---

export class FeatureTypeNotFoundError extends Error {
    constructor(name: string) {
        super(`Le type '${name}' est introuvable`);
        this.name = "FeatureTypeNotFoundError";
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
    return new Error(`Invalid ${GPF_WFS_MINISEARCH_OPTIONS_ENV}: ${reason}`);
}

// --- Search options parsing ---

// Parses and validates a plain-object value into MiniSearchCollectionSearchOptions.
// Throws a descriptive error if the value has unexpected keys or wrong value types.
function parseMiniSearchOptions(value: unknown): MiniSearchOptions {
    if (!isPlainObject(value)) {
        throw invalidSearchOptionsError("expected a JSON object");
    }

    for (const key of Object.keys(value)) {
        if (!TOP_LEVEL_MINISEARCH_OPTION_KEYS.includes(key as typeof TOP_LEVEL_MINISEARCH_OPTION_KEYS[number])) {
            throw invalidSearchOptionsError(`unexpected key '${key}'`);
        }
    }

    const options: MiniSearchOptions = {};

    if (value.fields !== undefined) {
        if (!Array.isArray(value.fields)) {
            throw invalidSearchOptionsError("expected 'fields' to be an array");
        }
        const fields: MiniSearchFieldOptionKey[] = [];
        for (const field of value.fields) {
            if (typeof field !== "string") {
                throw invalidSearchOptionsError("expected every 'fields' item to be a string");
            }
            if (!MINISEARCH_FIELD_OPTION_KEYS.includes(field as MiniSearchFieldOptionKey)) {
                throw invalidSearchOptionsError(`unexpected value 'fields.${field}'`);
            }
            fields.push(field as MiniSearchFieldOptionKey);
        }
        options.fields = fields;
    }

    if (value.combineWith !== undefined) {
        if (typeof value.combineWith !== "string") {
            throw invalidSearchOptionsError("expected 'combineWith' to be a string");
        }
        const combineWith = value.combineWith as typeof MINISEARCH_COMBINE_WITH_VALUES[number];
        if (!MINISEARCH_COMBINE_WITH_VALUES.includes(combineWith)) {
            throw invalidSearchOptionsError("expected 'combineWith' to be 'AND' or 'OR'");
        }
        options.combineWith = combineWith;
    }

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

        const boost: Partial<Record<MiniSearchBoostOptionKey, number>> = {};
        for (const key of Object.keys(value.boost)) {
            if (!MINISEARCH_BOOST_OPTION_KEYS.includes(key as MiniSearchBoostOptionKey)) {
                throw invalidSearchOptionsError(`unexpected key 'boost.${key}'`);
            }
            const rawScore = value.boost[key];
            if (!isFiniteNumber(rawScore)) {
                throw invalidSearchOptionsError(`expected 'boost.${key}' to be a finite number`);
            }
            boost[key as MiniSearchBoostOptionKey] = rawScore;
        }
        options.boost = boost;
    }

    return options;
}

function createMiniSearchEngineOptions(miniSearch?: MiniSearchOptions) {
    if (!miniSearch) {
        return undefined;
    }

    return {
        defaultSearchOptions: miniSearch,
    };
}

// Reads MiniSearch options from the GPF_WFS_MINISEARCH_OPTIONS environment variable.
// Returns undefined when the variable is absent or empty.
export function loadMiniSearchOptionsFromEnv(): MiniSearchOptions | undefined {
    const rawValue = process.env[GPF_WFS_MINISEARCH_OPTIONS_ENV];
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

    return parseMiniSearchOptions(parsedValue);
}

// --- WFS client ---

export class WfsClient {

    private readonly catalog;

    constructor(
        public baseUrl: string = GPF_WFS_URL,
        options: { miniSearch?: MiniSearchOptions } = {},
    ) {
        const searchEngineOptions = createMiniSearchEngineOptions(options.miniSearch);
        this.catalog = getCollectionCatalog({
            engineFactory: (items) => new MiniSearchCollectionSearchEngine(items, searchEngineOptions),
        });
    }

    async getFeatureTypes(): Promise<Collection[]> {
        return this.catalog.list();
    }

    async searchFeatureTypesWithScores(query: string, maxResults: number = 20): Promise<CollectionSearchResult[]> {
        return this.catalog.searchWithScores(query, {
            limit: maxResults,
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

// Pre-configured client using the default GPF endpoint and optional env-based MiniSearch options.
export const wfsClient = new WfsClient(undefined, {
    miniSearch: loadMiniSearchOptionsFromEnv(),
});
