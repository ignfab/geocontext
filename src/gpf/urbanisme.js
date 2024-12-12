
import distance from "../helpers/distance.js";
import { fetchJSON } from "../helpers/http.js";
import logger from "../logger.js";

// https://data.geopf.fr/wfs/ows?service=WFS&version=2.0.0&request=GetCapabilities
const URBANISME_TYPES = [
    'wfs_scot:scot',
    'wfs_du:document', 
    'wfs_du:info_pct',
    'wfs_du:info_lin',
    'wfs_du:info_surf',
    'wfs_du:prescription_pct',
    'wfs_du:prescription_lin',
    'wfs_du:prescription_surf'
];

/**
 * Get urbanism infos for a given location
 *
 * @param {number} lon 
 * @param {number} lat 
 * @returns 
 */
export async function getUrbanisme(lon, lat) {
    logger.info(`getUrbanisme(${lon},${lat})...`);

    // note that EPSG:4326 means lat,lon order for GeoServer -> flipped coordinates...
    const cql_filter = `DWITHIN(the_geom,Point(${lat} ${lon}),30,meters)`;

    const sourceGeom = {
        "type": "Point",
        "coordinates": [lon,lat]
    };

    // TODO : avoid useless geometry retrieval at WFS level
    const url = 'https://data.geopf.fr/wfs?' + new URLSearchParams({
        service: 'WFS',
        request: 'GetFeature',
        typeName: URBANISME_TYPES.join(','),
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
            distance: (distance(
                sourceGeom,
                feature.geometry
            ) * 1000.0),
            source: "Géoplateforme - (WFS Géoportail de l'Urbanisme)",
        }, feature.properties);
    });
}

const ASSIETTES_SUP_TYPES = [
    'wfs_sup:assiette_sup_p',
    'wfs_sup:assiette_sup_l',
    'wfs_sup:assiette_sup_s',
];

/**
 * Renvoie la 
 *
 * @param {number} lon 
 * @param {number} lat 
 * @returns 
 */
export async function getAssiettesServitudes(lon, lat) {
    logger.info(`getAssiettesServitudes(${lon},${lat})...`);

    // note that EPSG:4326 means lat,lon order for GeoServer -> flipped coordinates...
    const cql_filter = `DWITHIN(the_geom,Point(${lat} ${lon}),30,meters)`;

    const sourceGeom = {
        "type": "Point",
        "coordinates": [lon,lat]
    };

    // TODO : avoid useless geometry retrieval at WFS level
    const url = 'https://data.geopf.fr/wfs?' + new URLSearchParams({
        service: 'WFS',
        request: 'GetFeature',
        typeName: ASSIETTES_SUP_TYPES.join(','),
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
            distance: (distance(
                sourceGeom,
                feature.geometry
            ) * 1000.0),
            source: "Géoplateforme (Géoportail de l'Urbanisme)",
        }, feature.properties);
    });
}


