export const GPF_WFS_URL = "https://data.geopf.fr/wfs";

import { WfsEndpoint, WfsFeatureTypeBrief } from "@camptocamp/ogc-client";

export class FeatureTypeNotFoundError extends Error {
    constructor(name: string) {
        super(`Type '${name}' not found`);
    }
}

export class WfsClient {
    private endpoint: WfsEndpoint;

    private featureTypes: Map<string, WfsFeatureTypeBrief> = new Map();

    constructor(public baseUrl: string = GPF_WFS_URL) {
        this.endpoint = new WfsEndpoint(this.baseUrl);
    }

    async getFeatureTypes() {
        await this.endpoint.isReady();
        return this.endpoint.getFeatureTypes();
    }

    async getFeatureType(name: string) {
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
