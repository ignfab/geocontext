import { fetchWfsFeatures, mapWfsFeature } from '../helpers/wfs.js';
import logger from '../logger.js';

type JsonFetcher = (url: string) => Promise<any>;

type AdminUnit = Record<string, unknown>;

/**
 * ADMINEXPRESS-COG.LATEST:{type}
 * 
 * https://data.geopf.fr/wfs/ows?service=WFS&version=2.0.0&request=GetCapabilities
 */
export const ADMINEXPRESS_SOURCE = "Géoplateforme (WFS, ADMINEXPRESS-COG.LATEST)";
export const ADMINEXPRESS_TYPES = [
    'arrondissement',
    'arrondissement_municipal',
    'canton',
    'collectivite_territoriale',
    'commune',
    'commune_associee_ou_deleguee',
    'departement',
    'epci',
    'region'
];

/**
 * Get administrative units (commune, departement,...) intersecting a given location
 *
 * @param {number} lon 
 * @param {number} lat 
 * @param {(url: string) => Promise<any>} [fetcher]
 * @returns {Promise<AdminUnit[]>}
 */
export async function getAdminUnits(lon: number, lat: number, fetcher?: JsonFetcher): Promise<AdminUnit[]>{
    logger.info(`[adminexpress] getAdminUnits(${lon},${lat})...`);

    // Using EWKT format with SRID=4326 prefix for standard lon,lat order
    const cql_filter = `INTERSECTS(geometrie,SRID=4326;POINT(${lon} ${lat}))`;
    const typeNames = ADMINEXPRESS_TYPES.map((type) => `ADMINEXPRESS-COG.LATEST:${type}`);

    const features = await fetchWfsFeatures(typeNames, cql_filter, 'ADMINEXPRESS', fetcher);
    return features.map((feature) => mapWfsFeature(feature, typeNames));
}
