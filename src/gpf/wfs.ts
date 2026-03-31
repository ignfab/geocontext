export const GPF_WFS_URL = "https://data.geopf.fr/wfs";

import {
    Collection,
    getCollectionCatalog,
    MiniSearchCollectionSearchEngine,
    MiniSearchCollectionSearchEngineOptions,
} from '@ignfab/gpf-schema-store';

export class FeatureTypeNotFoundError extends Error {
    constructor(name: string) {
        super(`Type '${name}' not found`);
    }
}

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



export const wfsClient = new WfsClient();
