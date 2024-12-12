import logger from '../logger.js';

import distance from '../helpers/distance.js';

import {orderBy} from 'lodash';
import { fetchJSON } from '../helpers/http.js';

// CADASTRALPARCELS.PARCELLAIRE_EXPRESS:
// https://data.geopf.fr/wfs/ows?service=WFS&version=2.0.0&request=GetCapabilities

const PARCELLAIRE_EXPRESS_SOURCE = "Géoplateforme (WFS, CADASTRALPARCELS.PARCELLAIRE_EXPRESS)";
const PARCELLAIRE_EXPRESS_TYPES = [
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
    const sortedItems = orderBy(items, ['type', 'distance'], ['asc', 'desc']);
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
 * @returns 
 */
export async function getParcellaireExpress(lon, lat) {
    logger.info(`getParcellaireExpress(${lon},${lat}) ...`);
    // note that EPSG:4326 means lat,lon order for GeoServer -> flipped coordinates...
    const cql_filter = `DWITHIN(geom,Point(${lat} ${lon}),10,meters)`;

    const sourceGeom = {
        "type": "Point",
        "coordinates": [lon,lat]
    };

    // TODO : avoid useless geometry retrieval at WFS level
    const url = 'https://data.geopf.fr/wfs?' + new URLSearchParams({
        service: 'WFS',
        request: 'GetFeature',
        typeName: PARCELLAIRE_EXPRESS_TYPES.map((type) => { return `CADASTRALPARCELS.PARCELLAIRE_EXPRESS:${type}` }).join(','),
        outputFormat: 'application/json',
        cql_filter: cql_filter
    }).toString();

    const featureCollection = await fetchJSON(url);
    return filterByDistance(featureCollection.features.map((feature) => {
        // parse type from id (ex: "commune.3837")
        const type = feature.id.split('.')[0];
        // ignore geometry and extend properties
        return Object.assign({
            type: type,
            id: feature.id,
            bbox: feature.bbox,
            distance: distance(
                sourceGeom,
                feature.geometry
            ),
            source: PARCELLAIRE_EXPRESS_SOURCE,
        }, feature.properties);
    }));
}


