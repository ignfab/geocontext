/**
 * Administrative units lookup via the Géoplateforme WFS service.
 *
 * This module uses the structured WFS engine for request execution and
 * response mapping, resolving geometry property names dynamically from
 * the embedded catalog.
 */

import logger from '../logger.js';

import { getFeatureType } from '../helpers/wfs_engine/execution.js';
import { fetchWfsMultiTypename } from '../helpers/wfs_engine/execution.js';
import { getGeometryProperty } from '../helpers/wfs_engine/properties.js';
import { compileIntersectsPointSpatialFilter } from '../helpers/wfs_engine/spatialCql.js';
import { mapToFlatItems, type FlatItem } from '../helpers/wfs_engine/response.js';
import type { SpatialFilter } from '../helpers/wfs_engine/schema.js';
import type { WfsFeatureCollectionResponse } from '../helpers/wfs_engine/execution.js';

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
    logger.info(`[adminexpress] getAdminUnits(${lon},${lat})...`);

    // Resolve the geometry property name from the embedded catalog
    // (all ADMINEXPRESS types share the same schema, querying the first is sufficient)
    const featureType = await getFeatureType(ADMINEXPRESS_TYPENAMES[0]);
    const geometryProperty = getGeometryProperty(featureType);

    // Compile the spatial filter using the engine
    const spatialFilter: SpatialFilter = { operator: "intersects_point", lon, lat };
    const cqlFilter = compileIntersectsPointSpatialFilter(geometryProperty, spatialFilter);

    // Execute the multi-typename WFS query
    const featureCollection: WfsFeatureCollectionResponse = await fetchWfsMultiTypename({
        typenames: ADMINEXPRESS_TYPENAMES,
        cqlFilter,
        errorLabel: 'ADMINEXPRESS',
    });

    return mapToFlatItems(featureCollection, ADMINEXPRESS_TYPENAMES);
}
