/**
 * Structured WFS response layer used by the MCP WFS tools and domain-oriented modules.
 *
 * This module provides:
 * - FeatureCollection-preserving transformations for the MCP WFS tools
 * - Flat item mapping for domain-oriented modules (`src/gpf/*`)
 */

// --- Response Types ---

type GenericFeature = {
  id?: unknown;
  geometry?: unknown;
  geometry_name?: string;
  bbox?: unknown;
  properties?: unknown;
  [key: string]: unknown;
};

type GenericFeatureCollection = {
  features?: GenericFeature[];
  [key: string]: unknown;
};

type FeatureRef = {
  typename: string | null;
  feature_id: string;
};

type TransformedFeature = Record<string, unknown> & {
  feature_ref?: FeatureRef;
};

type TransformedFeatureCollection = Record<string, unknown> & {
  features?: TransformedFeature[];
};

/**
 * A flattened WFS feature with properties spread at the top level.
 *
 * This is the output format used by domain-oriented modules (`src/gpf/*`)
 * as opposed to the FeatureCollection-preserving format used by the MCP WFS tools.
 */
export type FlatItem = Record<string, unknown> & {
  type: string;
  id: string;
  bbox?: number[];
  feature_ref?: { typename: string; feature_id: string };
};

// --- Response Transformation ---

/**
 * Removes raw geometry payloads from a FeatureCollection, keeps GeoJSON validity by forcing
 * `geometry: null`, and exposes lightweight `feature_ref` objects reusable by follow-up requests.
 *
 * @param featureCollection Raw FeatureCollection returned by the WFS endpoint.
 * @returns A transformed FeatureCollection with raw geometry fields removed, `geometry: null`, and optional `feature_ref` metadata.
 */
export function transformFeatureCollectionResponse(
  featureCollection: GenericFeatureCollection,
): TransformedFeatureCollection {
  if (!Array.isArray(featureCollection.features)) {
    return featureCollection;
  }

  const transformedFeatures = featureCollection.features.map((feature) => {
    const { geometry: _geometry, geometry_name: _geometryName, ...rest } = feature;

    const nextFeature: Record<string, unknown> = {
      ...rest,
      geometry: null,
    };

    if (typeof feature.id === "string") {
      nextFeature.feature_ref = {
        typename: null,
        feature_id: feature.id,
      };
    }

    return nextFeature;
  });

  const { crs: _crs, ...restCollection } = featureCollection;
  return { ...restCollection, features: transformedFeatures };
}

// --- Feature References ---

/**
 * Transforms a FeatureCollection and injects the exact queried typename into each `feature_ref`.
 *
 * @param featureCollection Raw FeatureCollection returned by the WFS endpoint.
 * @param typename Typename of the queried layer.
 * @returns A transformed FeatureCollection whose `feature_ref` objects carry the exact typename.
 */
export function attachFeatureRefs(featureCollection: GenericFeatureCollection, typename: string) {
  const transformed = transformFeatureCollectionResponse(featureCollection);
  if (!Array.isArray(transformed.features)) {
    return transformed;
  }

  transformed.features = transformed.features.map((feature) => {
    if (!("feature_ref" in feature)) {
      return feature;
    }
    const featureRef = feature.feature_ref;
    if (typeof featureRef !== "object" || featureRef === null) {
      return feature;
    }
    return {
      ...feature,
      feature_ref: {
        ...featureRef,
        typename,
      },
    };
  });

  return transformed;
}

// --- Flat Item Mapping ---

/**
 * Resolves the fully qualified typename from a feature id prefix and a list of known typenames.
 *
 * @param featureId Feature id (e.g. `"commune.8952"`).
 * @param knownTypeNames Fully qualified typenames to match against.
 * @returns The matching typename, or `undefined`.
 */
function resolveTypename(featureId: string, knownTypeNames: string[]): string | undefined {
  const featureType = featureId.split(".")[0];
  return knownTypeNames.find((candidate) => candidate.endsWith(`:${featureType}`));
}

/**
 * Maps a single WFS feature to a flat item with spread properties and optional `feature_ref`.
 *
 * @param feature Raw WFS feature from the response.
 * @param knownTypeNames Fully qualified typenames used for `feature_ref` resolution.
 * @returns A flat item with type, id, bbox, optional feature_ref, and spread properties.
 */
function mapFeatureToFlatItem(feature: GenericFeature, knownTypeNames: string[]): FlatItem {
  const { properties, id, bbox, geometry: _geometry, geometry_name: _geometryName, ...rest } = feature;

  const featureId = typeof id === "string" ? id : "unknown";
  const typename = resolveTypename(featureId, knownTypeNames);

  return {
    ...(properties as Record<string, unknown> ?? {}),
    ...rest,
    type: featureId.split(".")[0],
    id: featureId,
    ...(bbox ? { bbox: bbox as number[] } : {}),
    ...(typename ? { feature_ref: { typename, feature_id: featureId } } : {}),
  };
}

/**
 * Maps a FeatureCollection to an array of flat items without preserving geometry.
 *
 * @param featureCollection Raw FeatureCollection returned by the WFS endpoint.
 * @param knownTypeNames Fully qualified typenames used for `feature_ref` resolution.
 * @returns An array of flat items with spread properties and `feature_ref`.
 */
export function mapToFlatItems(
  featureCollection: GenericFeatureCollection,
  knownTypeNames: string[],
): FlatItem[] {
  if (!Array.isArray(featureCollection.features)) {
    return [];
  }
  return featureCollection.features.map((feature) =>
    mapFeatureToFlatItem(feature, knownTypeNames),
  );
}

/**
 * Maps a FeatureCollection to an array of flat items preserving raw geometry
 * in a temporary `_rawGeometry` field for downstream distance calculations.
 *
 * Callers should strip `_rawGeometry` from the final output.
 *
 * @param featureCollection Raw FeatureCollection returned by the WFS endpoint.
 * @param knownTypeNames Fully qualified typenames used for `feature_ref` resolution.
 * @returns An array of flat items with `_rawGeometry` preserved.
 */
export function mapToFlatItemsWithGeometry(
  featureCollection: GenericFeatureCollection,
  knownTypeNames: string[],
): FlatItem[] {
  if (!Array.isArray(featureCollection.features)) {
    return [];
  }
  return featureCollection.features.map((feature) => {
    const flatItem = mapFeatureToFlatItem(feature, knownTypeNames);
    return {
      ...flatItem,
      _rawGeometry: feature.geometry ?? null,
    };
  });
}
