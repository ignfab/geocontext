export const GPF_WFS_URL = "https://data.geopf.fr/wfs";

import MiniSearch from 'minisearch'

import { Collection, getCollections} from '@ignfab/gpf-schema-store';

export class FeatureTypeNotFoundError extends Error {
    constructor(name: string) {
        super(`Type '${name}' not found`);
    }
}


export class FeatureTypeSearch {
    private miniSearch: MiniSearch;

    constructor(private featureTypes: Collection[]) {
        this.miniSearch = new MiniSearch({
            idField: 'id',
            fields: [
                'id',
                'namespace',
                'name',
                'title',
                'description',
                'properties'
            ],
        });
        const flattenFeatureTypes = this.featureTypes.map((featureType) => {
            return {
                ...featureType,
                properties: JSON.stringify(featureType.properties)
            }
        });
        this.miniSearch.addAll(flattenFeatureTypes);
    }

    search(query: string) {
        return this.miniSearch.search(query, { 
            boost: { 
                id: 3.0, 
                namespace: 5.0,
                title: 2.0,
                description: 1.5,
                properties: 1.3
            },
            fuzzy: 0.2
        });
    }

}

export class WfsClient {
    /**
     * id -> Collection
     */
    private featureTypes: Map<string, Collection> = new Map();

    private featureTypeSearch: FeatureTypeSearch;

    constructor(public baseUrl: string = GPF_WFS_URL) {
        const collections = getCollections();
        for ( const collection of collections) {
            this.featureTypes.set(collection.id, collection);
        }
        this.featureTypeSearch = new FeatureTypeSearch(collections);
    }

    async getFeatureTypes() : Promise<Collection[]> {
        return Array.from(this.featureTypes.values());
    }

    async searchFeatureTypes(query: string, maxResults: number = 20) : Promise<Collection[]> {
        const searchResults = this.featureTypeSearch.search(query).slice(0, maxResults);
        return searchResults.map((result) => {
            return this.featureTypes.get(result.id);
        });
    }

    async getFeatureType(name: string): Promise<Collection> {
        if ( this.featureTypes.has(name) ) {
            return this.featureTypes.get(name);
        }else{
            throw new FeatureTypeNotFoundError(name);
        }
    }

}



export const wfsClient = new WfsClient();
