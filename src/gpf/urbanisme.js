import distance from "../helpers/distance.js";
import { fetchWfsFeatures } from "../helpers/wfs.js";
import logger from "../logger.js";

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
const URBANISME_INVALID_COLLECTION_ERROR = "Le service Urbanisme n'a pas retourné de collection d'objets exploitable";

const URBANISME_EXCLUDED_PROPERTIES = new Set([
    'gpu_status',
    'urlfic'
]);

function sanitizeUrbanismeItem(item) {
    const sanitized = {};
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

function buildFeatureRef(knownTypeNames, featureId) {
    const featureType = featureId.split('.')[0];
    const typename = knownTypeNames.find((candidate) => candidate.endsWith(`:${featureType}`));
    if (!typename) {
        return undefined;
    }
    return {
        typename,
        feature_id: featureId,
    };
}


/**
 * Get urbanism infos for a given location
 *
 * @param {number} lon 
 * @param {number} lat 
 * @param {(url: string) => Promise<any>} [fetcher]
 * @returns 
 */
export async function getUrbanisme(lon, lat, fetcher) {
    logger.info(`getUrbanisme(${lon},${lat})...`);

    // note that EPSG:4326 means lat,lon order for GeoServer -> flipped coordinates...
    const cql_filter = `DWITHIN(the_geom,Point(${lat} ${lon}),30,meters)`;

    const sourceGeom = {
        "type": "Point",
        "coordinates": [lon,lat]
    };

    const features = await fetchWfsFeatures(URBANISME_TYPES, cql_filter, 'Urbanisme', fetcher);
    return features.map((feature) => {
        // parse type from id (ex: "commune.3837")
        const type = feature.id.split('.')[0];
        const featureRef = buildFeatureRef(URBANISME_TYPES, feature.id);
        // ignore geometry and extend properties
        const item = Object.assign({
            type: type,
            id: feature.id,
            bbox: feature.bbox,
            ...(featureRef ? { feature_ref: featureRef } : {}),
            distance: (distance(
                sourceGeom,
                feature.geometry
            ) * 1000.0)
        }, feature.properties);
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
 * @returns 
 */
export async function getAssiettesServitudes(lon, lat, fetcher) {
    logger.info(`getAssiettesServitudes(${lon},${lat})...`);

    // note that EPSG:4326 means lat,lon order for GeoServer -> flipped coordinates...
    const cql_filter = `DWITHIN(the_geom,Point(${lat} ${lon}),30,meters)`;

    const sourceGeom = {
        "type": "Point",
        "coordinates": [lon,lat]
    };

    const features = await fetchWfsFeatures(ASSIETTES_SUP_TYPES, cql_filter, 'Urbanisme', fetcher);
    return features.map((feature) => {
        // parse type from id (ex: "commune.3837")
        const type = feature.id.split('.')[0];
        const featureRef = buildFeatureRef(ASSIETTES_SUP_TYPES, feature.id);
        // ignore geometry and extend properties
        return Object.assign({
            type: type,
            id: feature.id,
            bbox: feature.bbox,
            ...(featureRef ? { feature_ref: featureRef } : {}),
            distance: (distance(
                sourceGeom,
                feature.geometry
            ) * 1000.0)
        }, feature.properties);
    });
}
