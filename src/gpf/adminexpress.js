import { fetchJSON } from '../helpers/http.js';
import logger from '../logger.js';

import _ from 'lodash';

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
 * @returns {object[]}
 */
export async function getAdminUnits(lon, lat) {
    logger.info(`[adminexpress] getAdminUnits(${lon},${lat})...`);

    // note that EPSG:4326 means lat,lon order for GeoServer -> flipped coordinates...
    const cql_filter = `INTERSECTS(geometrie,Point(${lat} ${lon}))`;

    // TODO : avoid useless geometry retrieval at WFS level
    const url = 'https://data.geopf.fr/wfs?' + new URLSearchParams({
        service: 'WFS',
        request: 'GetFeature',
        typeName: ADMINEXPRESS_TYPES.map((type) => { return `ADMINEXPRESS-COG.LATEST:${type}` }).join(','),
        outputFormat: 'application/json',
        cql_filter: cql_filter
    }).toString();

    const featureCollection = await fetchJSON(url);
    return featureCollection.features.map((feature) => {
        // parse type from id (ex: "commune.3837")
        const type = feature.id.split('.')[0];
        // ignore geometry and extend properties
        return Object.assign({
            type: type,
            id: feature.id,
            bbox: feature.bbox,
            source: ADMINEXPRESS_SOURCE,
        }, feature.properties);
    });
}

