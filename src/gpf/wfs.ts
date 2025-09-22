export const GPF_WFS_URL = "https://data.geopf.fr/wfs";

import { WfsEndpoint, WfsFeatureTypeBrief } from "@camptocamp/ogc-client";



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
        // TODO : gérer le cas où le type n'existe pas
        const featureType = await this.endpoint.getFeatureTypeFull(name);
        this.featureTypes.set(name, featureType);
        return featureType;
    }


}


export const wfsClient = new WfsClient();
