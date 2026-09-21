/**
 * Administrative units lookup via the Géoplateforme WFS service.
 *
 * This module uses the structured WFS engine for request execution and
 * response mapping, resolving geometry property names dynamically from
 * the embedded catalog.
 */

import logger from '../logger.js';

import { wfsClient } from '../wfs/execution.js';
import type { WfsFeatureCollectionResponse } from '../wfs/types.js';
import { getGeometryName } from '../wfs/properties.js';
import { compileIntersectsPointSpatialFilter } from '../wfs/spatialCql.js';
import { mapToFlatItems, type FlatItem } from '../wfs/response.js';
import type { SpatialFilter } from '../wfs/schema.js';

type AdminUnit = FlatItem;

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

const ADMINEXPRESS_TYPENAMES = ADMINEXPRESS_TYPES.map((type) => `ADMINEXPRESS-COG.LATEST:${type}`);

/**
 * Get administrative units (commune, departement,...) intersecting a given location.
 *
 * @param lon Longitude of the query point.
 * @param lat Latitude of the query point.
 * @returns Administrative units covering the requested point.
 */
export async function getAdminUnits(lon: number, lat: number): Promise<AdminUnit[]> {
    logger.debug(`[gpf:adminexpress] getAdminUnits(${lon},${lat})...`);

    const spatialFilter: SpatialFilter = { operator: "intersects_point", lon, lat };

    // Resolve and compile one spatial filter per typename to avoid relying on
    // cross-layer geometry property homogeneity.
    const cqlFilters = await Promise.all(ADMINEXPRESS_TYPENAMES.map(async (typename) => {
        const featureType = await wfsClient.getFeatureType(typename);
        const geometryName = getGeometryName(featureType);
        return compileIntersectsPointSpatialFilter(geometryName, spatialFilter);
    }));

    // Execute the multi-typename WFS query
    const featureCollection: WfsFeatureCollectionResponse = await wfsClient.fetchMultiTypename({
        typenames: ADMINEXPRESS_TYPENAMES,
        cqlFilters,
        errorLabel: 'ADMINEXPRESS',
    });

    return mapToFlatItems(featureCollection, ADMINEXPRESS_TYPENAMES);
}
