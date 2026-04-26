/**
 * Urban planning and SUP (servitudes d'utilité publique) lookup via the Géoplateforme WFS service.
 *
 * This module uses the structured WFS engine for request execution and
 * response mapping, resolving geometry property names dynamically from
 * the embedded catalog.
 */

import logger from '../logger.js';
import distance from '../helpers/distance.js';
import type { Point } from 'geojson';

import { getFeatureType, fetchWfsMultiTypename, type WfsFeatureCollectionResponse } from '../helpers/wfs_engine/execution.js';
import { getGeometryProperty } from '../helpers/wfs_engine/properties.js';
import { compileDwithinSpatialFilter } from '../helpers/wfs_engine/spatialCql.js';
import { mapToFlatItemsWithGeometry, type FlatItem } from '../helpers/wfs_engine/response.js';
import type { SpatialFilter } from '../helpers/wfs_engine/schema.js';

type UrbanismeItem = FlatItem & {
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
 * Get urbanism infos for a given location.
 *
 * @param lon Longitude of the query point.
 * @param lat Latitude of the query point.
 * @returns Urban planning objects relevant to the requested point.
 */
export async function getUrbanisme(lon: number, lat: number): Promise<Record<string, unknown>[]> {
    logger.info(`getUrbanisme(${lon},${lat})...`);

    // Resolve the geometry property name from the embedded catalog
    const featureType = await getFeatureType(URBANISME_TYPES[0]);
    const geometryProperty = getGeometryProperty(featureType);

    // Compile the spatial filter using the engine
    const spatialFilter: SpatialFilter = {
        operator: "dwithin_point",
        lon,
        lat,
        distance_m: 30,
    };
    const cqlFilter = compileDwithinSpatialFilter(geometryProperty, spatialFilter);

    // Execute the multi-typename WFS query
    const featureCollection: WfsFeatureCollectionResponse = await fetchWfsMultiTypename({
        typenames: URBANISME_TYPES,
        cqlFilter,
        errorLabel: 'Urbanisme',
    });

    // Map to flat items preserving geometry for distance calculation
    const sourceGeom: Point = { type: "Point", coordinates: [lon, lat] };
    const items = mapToFlatItemsWithGeometry(featureCollection, URBANISME_TYPES);

    return items.map((item) => {
        const { _rawGeometry: _, ...rest } = item;
        const urbanismeItem: UrbanismeItem = {
            ...rest,
            distance: distance(sourceGeom, (item as Record<string, unknown>)._rawGeometry as any),
        };
        return sanitizeUrbanismeItem(urbanismeItem);
    });
}

const ASSIETTES_SUP_TYPES = [
    'wfs_sup:assiette_sup_p',
    'wfs_sup:assiette_sup_l',
    'wfs_sup:assiette_sup_s',
];

/**
 * Get SUP infos for a given location.
 *
 * @param lon Longitude of the query point.
 * @param lat Latitude of the query point.
 * @returns SUP footprints relevant to the requested point.
 */
export async function getAssiettesServitudes(lon: number, lat: number): Promise<UrbanismeItem[]> {
    logger.info(`getAssiettesServitudes(${lon},${lat})...`);

    // Resolve the geometry property name from the embedded catalog
    const featureType = await getFeatureType(ASSIETTES_SUP_TYPES[0]);
    const geometryProperty = getGeometryProperty(featureType);

    // Compile the spatial filter using the engine
    const spatialFilter: SpatialFilter = {
        operator: "dwithin_point",
        lon,
        lat,
        distance_m: 30,
    };
    const cqlFilter = compileDwithinSpatialFilter(geometryProperty, spatialFilter);

    // Execute the multi-typename WFS query
    const featureCollection: WfsFeatureCollectionResponse = await fetchWfsMultiTypename({
        typenames: ASSIETTES_SUP_TYPES,
        cqlFilter,
        errorLabel: 'Urbanisme',
    });

    // Map to flat items preserving geometry for distance calculation
    const sourceGeom: Point = { type: "Point", coordinates: [lon, lat] };
    const items = mapToFlatItemsWithGeometry(featureCollection, ASSIETTES_SUP_TYPES);

    return items.map((item) => {
        const { _rawGeometry: _, ...rest } = item;
        return {
            ...rest,
            distance: distance(sourceGeom, (item as Record<string, unknown>)._rawGeometry as any),
        };
    });
}
