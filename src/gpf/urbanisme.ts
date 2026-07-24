/**
 * Urban planning and SUP (servitudes d'utilité publique) lookup via the Géoplateforme WFS service.
 *
 * This module uses the structured WFS engine for request execution and
 * response mapping, resolving geometry property names dynamically from
 * the embedded catalog.
 */

import logger from '../logger.js';
import distance from '../helpers/distance.js';
import type { Point, Geometry } from 'geojson';

import { wfsClient } from '../wfs/execution.js';
import type { WfsFeatureCollectionResponse } from '../wfs/types.js';
import { getGeometryName } from '../wfs/properties.js';
import { compileDwithinSpatialFilter } from '../wfs/spatialCql.js';
import { mapToFlatItemsWithGeometry, type FlatItem } from '../wfs/response.js';
import type { SpatialFilter } from '../wfs/schema.js';

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
    logger.debug(`[gpf:urbanisme] getUrbanisme(${lon},${lat})...`);

    const spatialFilter: SpatialFilter = {
        operator: "dwithin_point",
        lon,
        lat,
        distance_m: 30,
    };

    // Resolve and compile one spatial filter per typename to avoid relying on
    // cross-layer geometry property homogeneity.
    const cqlFilters = await Promise.all(URBANISME_TYPES.map(async (typename) => {
        const featureType = await wfsClient.getFeatureType(typename);
        const geometryName = getGeometryName(featureType);
        return compileDwithinSpatialFilter(geometryName, spatialFilter);
    }));

    // Execute the multi-typename WFS query
    const featureCollection: WfsFeatureCollectionResponse = await wfsClient.fetchMultiTypename({
        typenames: URBANISME_TYPES,
        cqlFilters,
        errorLabel: 'Urbanisme',
    });

    // Map to flat items preserving geometry for distance calculation
    const sourceGeom: Point = { type: "Point", coordinates: [lon, lat] };
    const items = mapToFlatItemsWithGeometry(featureCollection, URBANISME_TYPES);

    return items.map((item) => {
        const { _rawGeometry, ...rest } = item;
        const urbanismeItem: UrbanismeItem = {
            ...rest,
            distance: distance(sourceGeom, _rawGeometry as Geometry),
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
    logger.debug(`[gpf:urbanisme] getAssiettesServitudes(${lon},${lat})...`);

    const spatialFilter: SpatialFilter = {
        operator: "dwithin_point",
        lon,
        lat,
        distance_m: 30,
    };

    // Resolve and compile one spatial filter per typename to avoid relying on
    // cross-layer geometry property homogeneity.
    const cqlFilters = await Promise.all(ASSIETTES_SUP_TYPES.map(async (typename) => {
        const featureType = await wfsClient.getFeatureType(typename);
        const geometryName = getGeometryName(featureType);
        return compileDwithinSpatialFilter(geometryName, spatialFilter);
    }));

    // Execute the multi-typename WFS query
    const featureCollection: WfsFeatureCollectionResponse = await wfsClient.fetchMultiTypename({
        typenames: ASSIETTES_SUP_TYPES,
        cqlFilters,
        errorLabel: 'Urbanisme',
    });

    // Map to flat items preserving geometry for distance calculation
    const sourceGeom: Point = { type: "Point", coordinates: [lon, lat] };
    const items = mapToFlatItemsWithGeometry(featureCollection, ASSIETTES_SUP_TYPES);

    return items.map((item) => {
        const { _rawGeometry, ...rest } = item;
        return {
            ...rest,
            distance: distance(sourceGeom, _rawGeometry as Geometry),
        };
    });
}
