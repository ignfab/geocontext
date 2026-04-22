import { fetchJSON } from './http.js';
import type { Point, BBox, Geometry } from 'geojson';
const GPF_WFS_BASE_URL = process.env.GPF_WFS_BASE_URL || 'https://data.geopf.fr/wfs';

type JsonFetcher = (url: string) => Promise<any>;

type WfsFeature = {
  id: string;
  properties: Record<string, unknown>;
  geometry: Geometry;
  bbox?: BBox;
};

type WfsFeatureCollection = {
  features?: WfsFeature[];
};

export type FeatureRef = {
  typename: string;
  feature_id: string;
};

export type FlatWfsFeature = Record<string, unknown> & {
  type: string;
  id: string;
  bbox?: BBox;
  feature_ref?: FeatureRef;
};

/**
 * Fetch features from a GPF WFS endpoint.
 *
 * @param {string[]} typeNames - fully qualified WFS type names
 * @param {string} cqlFilter - CQL_FILTER value
 * @param {string} errorLabel - service label used in the error message
 * @param {(url: string) => Promise<any>} [fetcher]
 * @returns {Promise<WfsFeature[]>} raw GeoJSON features array
 */
export async function fetchWfsFeatures(typeNames: string[], cqlFilter: string, errorLabel: string, fetcher: JsonFetcher = fetchJSON) : Promise<WfsFeature[]> {
    const url = GPF_WFS_BASE_URL + '?' + new URLSearchParams({
        service: 'WFS',
        request: 'GetFeature',
        typeName: typeNames.join(','),
        outputFormat: 'application/json',
        cql_filter: cqlFilter,
    }).toString();

    const featureCollection = await fetcher(url);
    if (!Array.isArray(featureCollection?.features)) {
        throw new Error(`Le service ${errorLabel} n'a pas retourné de collection d'objets exploitable`);
    }
    return featureCollection.features;
}

/**
 * Builds a GeoJSON Point from longitude and latitude.
 *
 * @param {number} lon
 * @param {number} lat
 * @returns {object} GeoJSON Point
 */
export function toGeoJsonPoint(lon: number, lat:number): Point {
    return { type: "Point", coordinates: [lon, lat] };
}

/**
 * Maps a raw WFS feature into a flat result object, stripping geometry
 * and resolving a reusable feature_ref from the known type names.
 *
 * @param {object}  feature        - Raw GeoJSON feature from WFS
 * @param {string[]} knownTypeNames - Fully qualified WFS type names used for feature_ref resolution
 * @returns {FlatWfsFeature} Flat result with type, id, bbox, optional feature_ref, and spread properties
 */
export function mapWfsFeature(feature: WfsFeature, knownTypeNames: string[]): FlatWfsFeature {
    const type = feature.id.split('.')[0];
    const typename = knownTypeNames.find((t) => t.endsWith(`:${type}`));
    return {
        ...feature.properties,
        type,
        id: feature.id,
        bbox: feature.bbox,
        ...(typename ? { feature_ref: { typename, feature_id: feature.id } } : {}),
    };
}
