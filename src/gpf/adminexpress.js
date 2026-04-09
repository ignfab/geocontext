import _ from 'lodash';

import { fetchWfsFeatures } from '../helpers/wfs.js';
import logger from '../logger.js';

/**
 * ADMINEXPRESS-COG.LATEST:{type}
 * 
 * https://data.geopf.fr/wfs/ows?service=WFS&version=2.0.0&request=GetCapabilities
 */
export const ADMINEXPRESS_SOURCE = "Géoplateforme (WFS, ADMINEXPRESS-COG.LATEST)";
export const ADMINEXPRESS_TYPES = [
    'commune', 
    'canton',
    'collectivite_territoriale',
    'epci',
    'departement',
    'region', 
    'arrondissement'
];

/**
 * Get administrative units (commune, departement,...) intersecting a given location
 *
 * @param {number} lon 
 * @param {number} lat 
 * @param {(url: string) => Promise<any>} [fetcher]
 * @returns {object[]}
 */
export async function getAdminUnits(lon, lat, fetcher) {
    logger.info(`[adminexpress] getAdminUnits(${lon},${lat})...`);

    // note that EPSG:4326 means lat,lon order for GeoServer -> flipped coordinates...
    const cql_filter = `INTERSECTS(geometrie,Point(${lat} ${lon}))`;
    const typeNames = ADMINEXPRESS_TYPES.map((type) => `ADMINEXPRESS-COG.LATEST:${type}`);

    const features = await fetchWfsFeatures(typeNames, cql_filter, 'ADMINEXPRESS', fetcher);
    return features.map((feature) => {
        // parse type from id (ex: "commune.3837")
        const type = feature.id.split('.')[0];
        // ignore geometry and extend properties
        return Object.assign({
            type: type,
            id: feature.id,
            bbox: feature.bbox,
            feature_ref: {
                typename: `ADMINEXPRESS-COG.LATEST:${type}`,
                feature_id: feature.id,
            },
        }, feature.properties);
    });
}
