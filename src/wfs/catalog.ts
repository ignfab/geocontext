// --- Imports ---

import {
    Collection,
    CollectionSearchResult,
    getCollectionCatalog,
    MiniSearchCollectionSearchEngine,
    MiniSearchCollectionSearchOptions,
} from '@ignfab/gpf-schema-store';
import { z } from 'zod';
import { getEnv } from '../config/env.js';

// --- Constants ---

export const GPF_URL = "https://data.geopf.fr/wfs";

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

const MINISEARCH_COMBINE_WITH_VALUES = ["AND", "OR"] as const;

// --- Types ---

type MiniSearchOptions = MiniSearchCollectionSearchOptions;

// --- Errors ---

export class FeatureTypeNotFoundError extends Error {
    constructor(name: string) {
        super(`Le type '${name}' est introuvable`);
        this.name = "FeatureTypeNotFoundError";
    }
}

// --- Helpers ---

function invalidSearchOptionsError(reason: string): Error {
    return new Error(`Invalid GPF_WFS_MINISEARCH_OPTIONS: ${reason}`);
}

// --- Search options schema ---

const miniSearchOptionsSchema = z.object({
    fields: z.array(z.enum(MINISEARCH_INDEXED_OPTION_KEYS)).optional(),
    combineWith: z.enum(MINISEARCH_COMBINE_WITH_VALUES).optional(),
    fuzzy: z.number().finite().optional(),
    boost: z.record(z.enum(MINISEARCH_INDEXED_OPTION_KEYS), z.number().finite()).optional(),
}).strict();

// Parses and validates a plain-object value into MiniSearchCollectionSearchOptions.
// Throws a descriptive error if the value has unexpected keys or wrong value types.
function parseMiniSearchOptions(value: unknown): MiniSearchOptions {
    const result = miniSearchOptionsSchema.safeParse(value);
    if (!result.success) {
        const issue = result.error.issues[0];
        const path = issue.path.length > 0 ? issue.path.join('.') : undefined;
        const detail = path ? `${path}: ${issue.message}` : issue.message;
        throw invalidSearchOptionsError(detail);
    }
    return result.data;
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
    const raw = getEnv().GPF_WFS_MINISEARCH_OPTIONS;
    if (!raw) {
        return undefined;
    }

    return parseMiniSearchOptions(raw);
}

// --- WFS Schema Store ---

export class WfsSchemaStore {

    private readonly catalog;

    constructor(options: { miniSearch?: MiniSearchOptions } = {}) {
        const searchEngineOptions = createMiniSearchEngineOptions(options.miniSearch);
        this.catalog = getCollectionCatalog({
            engineFactory: (items: Collection[]) => new MiniSearchCollectionSearchEngine(items, searchEngineOptions),
        });
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
export const wfsSchemaStore = new WfsSchemaStore({
    miniSearch: loadMiniSearchOptionsFromEnv(),
});
