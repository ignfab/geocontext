import distance from "../helpers/distance.js";
import { fetchWfsFeatures, mapWfsFeature, toGeoJsonPoint } from "../helpers/wfs.js";
import logger from "../logger.js";
import type { FlatWfsFeature } from "../helpers/wfs.js";

type JsonFetcher = (url: string) => Promise<any>;

type UrbanismeItem = FlatWfsFeature & {
  distance: number;
};

// https://data.geopf.fr/wfs/ows?service=WFS&version=2.0.0&request=GetCapabilities
export const URBANISME_TYPES = [
    'wfs_scot:scot',
    'wfs_du:document',
    'wfs_du:zone_urba',
    'wfs_du:secteur_cc',
    'wfs_du:info_pct',
    'wfs_du:info_lin',
    'wfs_du:info_surf',
    'wfs_du:prescription_pct',
    'wfs_du:prescription_lin',
    'wfs_du:prescription_surf'
];

export const URBANISME_SOURCE = "Géoplateforme - (WFS Géoportail de l'Urbanisme)";

const URBANISME_EXCLUDED_PROPERTIES = new Set([
    'gpu_status',
    'urlfic'
]);

function sanitizeUrbanismeItem(item: UrbanismeItem): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(item)) {
        if (URBANISME_EXCLUDED_PROPERTIES.has(key)) {
            continue;
        }
        if (value === null || value === '') {
            continue;
        }
        sanitized[key] = value;
    }
    return sanitized;
}


/**
 * Get urbanism infos for a given location
 *
 * @param {number} lon 
 * @param {number} lat 
 * @param {(url: string) => Promise<any>} [fetcher]
 * @returns {Promise<Record<string, unknown>[]>}
 */
export async function getUrbanisme(lon: number, lat: number, fetcher?: JsonFetcher): Promise<Record<string, unknown>[]> {
    logger.info(`getUrbanisme(${lon},${lat})...`);

    // Using EWKT format with SRID=4326 prefix for standard lon,lat order
    const cql_filter = `DWITHIN(the_geom,SRID=4326;POINT(${lon} ${lat}),30,meters)`;

    const sourceGeom = toGeoJsonPoint(lon, lat);

    const features = await fetchWfsFeatures(URBANISME_TYPES, cql_filter, 'Urbanisme', fetcher);
    return features.map((feature) => {
        const item = {
            ...mapWfsFeature(feature, URBANISME_TYPES),
            distance: distance(sourceGeom, feature.geometry),
        };
        return sanitizeUrbanismeItem(item);
    });
}

const ASSIETTES_SUP_TYPES = [
    'wfs_sup:assiette_sup_p',
    'wfs_sup:assiette_sup_l',
    'wfs_sup:assiette_sup_s',
];

/**
 * Get SUP infos for a given location
 *
 * @param {number} lon 
 * @param {number} lat 
 * @param {(url: string) => Promise<any>} [fetcher]
 * @returns {Promise<UrbanismeItem[]>}
 */
export async function getAssiettesServitudes(lon: number, lat: number, fetcher?: JsonFetcher): Promise<UrbanismeItem[]> {
    logger.info(`getAssiettesServitudes(${lon},${lat})...`);

    // Using EWKT format with SRID=4326 prefix for standard lon,lat order
    const cql_filter = `DWITHIN(the_geom,SRID=4326;POINT(${lon} ${lat}),30,meters)`;

    const sourceGeom = toGeoJsonPoint(lon, lat);

    const features = await fetchWfsFeatures(ASSIETTES_SUP_TYPES, cql_filter, 'Urbanisme', fetcher);
    return features.map((feature) => ({
        ...mapWfsFeature(feature, ASSIETTES_SUP_TYPES),
        distance: distance(sourceGeom, feature.geometry),
    }));
}
