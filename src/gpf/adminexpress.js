import { fetchWfsFeatures, mapWfsFeature } from '../helpers/wfs.js';
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

    // Using EWKT format with SRID=4326 prefix for standard lon,lat order
    const cql_filter = `INTERSECTS(geometrie,SRID=4326;POINT(${lon} ${lat}))`;
    const typeNames = ADMINEXPRESS_TYPES.map((type) => `ADMINEXPRESS-COG.LATEST:${type}`);

    const features = await fetchWfsFeatures(typeNames, cql_filter, 'ADMINEXPRESS', fetcher);
    return features.map((feature) => mapWfsFeature(feature, typeNames));
}
