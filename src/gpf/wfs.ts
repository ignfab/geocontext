export const GPF_WFS_URL = "https://data.geopf.fr/wfs";

import { WfsEndpoint, WfsFeatureTypeBrief, WfsFeatureTypeFull } from "@camptocamp/ogc-client";
import MiniSearch from 'minisearch'

export class FeatureTypeNotFoundError extends Error {
    constructor(name: string) {
        super(`Type '${name}' not found`);
    }
}


export class FeatureTypeSearch {
    private miniSearch: MiniSearch;

    constructor(private featureTypes: WfsFeatureTypeBrief[]) {
        this.miniSearch = new MiniSearch({
            idField: 'name',
            fields: ['name', 'title', 'description'],
        });
        this.miniSearch.addAll(this.featureTypes);
    }

    search(query: string) {
        return this.miniSearch.search(query, { 
            boost: { title: 2 },
            fuzzy: 0.2
        });
    }

}

export class WfsClient {
    private endpoint: WfsEndpoint;

    private featureTypes: Map<string, WfsFeatureTypeFull> = new Map();

    private featureTypeSearch: FeatureTypeSearch;

    constructor(public baseUrl: string = GPF_WFS_URL) {
        this.endpoint = new WfsEndpoint(this.baseUrl);
    }

    async getFeatureTypes() : Promise<WfsFeatureTypeBrief[]> {
        await this.endpoint.isReady();
        return this.endpoint.getFeatureTypes();
    }

    async searchFeatureTypes(query: string, maxResults: number = 20) : Promise<WfsFeatureTypeBrief[]> {
        await this.endpoint.isReady();
        const featureTypes = await this.endpoint.getFeatureTypes();
        if ( ! this.featureTypeSearch ) {
            this.featureTypeSearch = new FeatureTypeSearch(featureTypes);
        }
        const searchResults = this.featureTypeSearch.search(query).slice(0, maxResults);
        return searchResults.map((result) => {
            return featureTypes.find((featureType) => featureType.name === result.id);
        });
    }

    async getFeatureType(name: string): Promise<WfsFeatureTypeFull> {
        await this.endpoint.isReady();
        if ( this.featureTypes.has(name) ) {
            return this.featureTypes.get(name);
        }
        const featureType = await this.endpoint.getFeatureTypeFull(name);
        if ( ! featureType ) {
            throw new FeatureTypeNotFoundError(name);
        }
        this.featureTypes.set(name, featureType);
        return featureType;
    }

}



export const wfsClient = new WfsClient();
