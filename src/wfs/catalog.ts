// --- Imports ---

import type {
    OgcCollectionSchema,
    CollectionSearchMatch,
    CollectionCatalogOptions,
    MiniSearchCollectionSearchOptions,
} from '@ignfab/gpf-schema-store';
import { getCollectionCatalog } from '@ignfab/gpf-schema-store';
import { getEnv, miniSearchOptionsSchema } from '../config/env.js';

export type GpfFeatureType = {
    typename: string;
    schema: OgcCollectionSchema;
};

// --- Constants ---

export const GPF_WFS_URL = "https://data.geopf.fr/wfs";

// --- Errors ---

export class FeatureTypeNotFoundError extends Error {
    constructor(name: string) {
        super(`Le type '${name}' n'existe pas. Utilise le tool gpf_search_types pour trouver les types existants et pertinents pour ta recherche.`);
        this.name = "FeatureTypeNotFoundError";
    }
}

// --- Helpers ---

function invalidSearchOptionsError(reason: string): Error {
    return new Error(`Invalid GPF_WFS_MINISEARCH_OPTIONS: ${reason}`);
}

// --- Search options schema ---

// Parses and validates a plain-object value into MiniSearchCollectionSearchOptions.
// Throws a descriptive error if the value has unexpected keys or wrong value types.
function parseMiniSearchOptions(value: unknown): MiniSearchCollectionSearchOptions {
    const result = miniSearchOptionsSchema.safeParse(value);
    if (!result.success) {
        const issue = result.error.issues[0];
        const path = issue.path.length > 0 ? issue.path.join('.') : undefined;
        const detail = path ? `${path}: ${issue.message}` : issue.message;
        throw invalidSearchOptionsError(detail);
    }
    return result.data;
}

// Reads MiniSearch options from the GPF_WFS_MINISEARCH_OPTIONS environment variable.
// Returns undefined when the variable is absent or empty.
export function loadMiniSearchOptionsFromEnv(): MiniSearchCollectionSearchOptions | undefined {
    const raw = getEnv().GPF_WFS_MINISEARCH_OPTIONS;
    if (!raw) {
        return undefined;
    }

    return parseMiniSearchOptions(raw);
}

// --- WFS Schema Store ---

export class WfsSchemaStore {

    private readonly catalog;

    constructor(options: CollectionCatalogOptions = {}) {
        this.catalog = getCollectionCatalog(options);
    }

    async searchFeatureTypes(query: string, maxResults: number = 20): Promise<CollectionSearchMatch[]> {
        return this.catalog.search(query, { limit: maxResults });
    }

    async getFeatureType(name: string): Promise<GpfFeatureType> {
        const schema = this.catalog.getCollectionSchema(name);
        if (schema) {
            return { typename: name, schema };
        }
        throw new FeatureTypeNotFoundError(name);
    }

    /** Checks whether a typename exists in the embedded catalog without throwing for missing entries. */
    hasFeatureType(name: string): boolean {
        return this.catalog.getCollectionSchema(name) !== undefined;
    }

}

// --- Default singleton ---

// Pre-configured client using the default GPF endpoint and optional env-based MiniSearch options.
const miniSearchFromEnv = loadMiniSearchOptionsFromEnv();
export const wfsSchemaStore = new WfsSchemaStore(
    miniSearchFromEnv ? { miniSearch: miniSearchFromEnv } : {},
);
