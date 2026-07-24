/**
 * Cadastral objects lookup via the Géoplateforme WFS service.
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

type ParcellaireExpressItem = FlatItem & {
    distance: number;
    source: string;
};

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

const PARCELLAIRE_EXPRESS_TYPENAMES = PARCELLAIRE_EXPRESS_TYPES.map(
    (type) => `CADASTRALPARCELS.PARCELLAIRE_EXPRESS:${type}`
);

/**
 * Filter items by distance keeping the nearest for each type.
 *
 * @param items Items sorted by type then distance.
 * @returns One item per type (the nearest).
 */
function filterByDistance(items: ParcellaireExpressItem[]): ParcellaireExpressItem[] {
    const sorted = [...items].sort((a, b) => {
        if (a.type !== b.type) return a.type.localeCompare(b.type);
        return a.distance - b.distance;
    });

    const result: ParcellaireExpressItem[] = [];
    let lastType: string | null = null;
    for (const item of sorted) {
        if (lastType === item.type) {
            continue;
        }
        result.push(item);
        lastType = item.type;
    }
    return result;
}

/**
 * Get items from CADASTRALPARCELS.PARCELLAIRE_EXPRESS near a given location.
 *
 * @param lon Longitude of the query point.
 * @param lat Latitude of the query point.
 * @returns The nearest cadastral objects, at most one per cadastral type.
 */
export async function getParcellaireExpress(lon: number, lat: number): Promise<ParcellaireExpressItem[]> {
    logger.debug(`[gpf:parcellaire-express] getParcellaireExpress(${lon},${lat}) ...`);

    const spatialFilter: SpatialFilter = {
        operator: "dwithin_point",
        lon,
        lat,
        distance_m: 10,
    };

    // Resolve and compile one spatial filter per typename to avoid relying on
    // cross-layer geometry property homogeneity.
    const cqlFilters = await Promise.all(PARCELLAIRE_EXPRESS_TYPENAMES.map(async (typename) => {
        const featureType = await wfsClient.getFeatureType(typename);
        const geometryName = getGeometryName(featureType);
        return compileDwithinSpatialFilter(geometryName, spatialFilter);
    }));

    // Execute the multi-typename WFS query
    const featureCollection: WfsFeatureCollectionResponse = await wfsClient.fetchMultiTypename({
        typenames: PARCELLAIRE_EXPRESS_TYPENAMES,
        cqlFilters,
        errorLabel: 'PARCELLAIRE_EXPRESS',
    });

    // Map to flat items preserving geometry for distance calculation
    const sourceGeom: Point = { type: "Point", coordinates: [lon, lat] };
    const items = mapToFlatItemsWithGeometry(featureCollection, PARCELLAIRE_EXPRESS_TYPENAMES);

    // Calculate distances, strip temporary geometry, and filter
    const enrichedItems: ParcellaireExpressItem[] = items.map((item) => {
        const { _rawGeometry, ...rest } = item;
        return {
            ...rest,
            distance: distance(sourceGeom, _rawGeometry as Geometry),
            source: PARCELLAIRE_EXPRESS_SOURCE,
        };
    });

    return filterByDistance(enrichedItems);
}
