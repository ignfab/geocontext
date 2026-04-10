import _ from 'lodash';

import distance from '../helpers/distance.js';
import { fetchWfsFeatures, mapWfsFeature, toGeoJsonPoint } from '../helpers/wfs.js';
import logger from '../logger.js';

// CADASTRALPARCELS.PARCELLAIRE_EXPRESS:
// https://data.geopf.fr/wfs/ows?service=WFS&version=2.0.0&request=GetCapabilities

export const PARCELLAIRE_EXPRESS_SOURCE = "Géoplateforme (WFS, CADASTRALPARCELS.PARCELLAIRE_EXPRESS)";
export const PARCELLAIRE_EXPRESS_TYPES = [
    'arrondissement', 
    'commune',
    'feuille',
    'parcelle',
    'subdivision_fiscale',
    'localisant'
];

/**
 * Filter items by distance keeping the nearest for each type.
 *
 * @param {array<object>} items 
 * @returns {array<object>}
 */
function filterByDistance(items){
    const sortedItems = _.orderBy(items, ['type', 'distance'], ['asc', 'asc']);

    const result = [];
    let lastType = null;
    for ( const item of sortedItems ){
        if ( lastType == item.type ){
            continue;
        }
        result.push(item);
        lastType = item.type;
    }
    return result;
}


/**
 * Get items from CADASTRALPARCELS.PARCELLAIRE_EXPRESS near of a given location.
 *
 * @see https://data.geopf.fr/wfs/ows?service=WFS&version=2.0.0&request=GetCapabilities
 * 
 * @param {number} lon 
 * @param {number} lat 
 * @param {(url: string) => Promise<any>} [fetcher]
 * @returns 
 */
export async function getParcellaireExpress(lon, lat, fetcher) {
    logger.info(`getParcellaireExpress(${lon},${lat}) ...`);
    // note that EPSG:4326 means lat,lon order for GeoServer -> flipped coordinates...
    const cql_filter = `DWITHIN(geom,Point(${lat} ${lon}),10,meters)`;
    const typeNames = PARCELLAIRE_EXPRESS_TYPES.map((type) => `CADASTRALPARCELS.PARCELLAIRE_EXPRESS:${type}`);

    const sourceGeom = toGeoJsonPoint(lon, lat);

    const features = await fetchWfsFeatures(typeNames, cql_filter, 'PARCELLAIRE_EXPRESS', fetcher);
    return filterByDistance(features.map((feature) => ({
        ...mapWfsFeature(feature, typeNames),
        distance: distance(sourceGeom, feature.geometry),
        source: PARCELLAIRE_EXPRESS_SOURCE,
    })));
}


