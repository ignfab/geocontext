/**
 * Structured WFS response layer used by the MCP WFS tools.
 *
 * Unlike the legacy/simple helper layer in `src/helpers/wfs.ts`, this module
 * keeps the response shape aligned with FeatureCollection/Feature-style outputs
 * and applies targeted transformations needed by the generic WFS toolchain.
 */

type GenericFeature = {
  id?: string;
  geometry?: unknown;
  geometry_name?: string;
  [key: string]: unknown;
};

type GenericFeatureCollection = {
  features?: GenericFeature[];
  [key: string]: unknown;
};

/**
 * Removes raw geometry payloads from a FeatureCollection, keeps GeoJSON validity by forcing
 * `geometry: null`, and exposes lightweight `feature_ref` objects reusable by follow-up requests.
 *
 * @param featureCollection Raw FeatureCollection returned by the WFS endpoint.
 * @returns A transformed FeatureCollection with raw geometry fields removed, `geometry: null`, and optional `feature_ref` metadata.
 */
export function transformFeatureCollectionResponse(featureCollection: GenericFeatureCollection) {
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

/**
 * Transforms a FeatureCollection and injects the exact queried typename into each `feature_ref`.
 *
 * @param featureCollection Raw FeatureCollection returned by the WFS endpoint.
 * @param typename Typename of the queried layer.
 * @returns A transformed FeatureCollection whose `feature_ref` objects carry the exact typename.
 */
export function attachFeatureRefs(featureCollection: GenericFeatureCollection, typename: string) {
  const transformed = transformFeatureCollectionResponse(featureCollection) as Record<string, unknown>;
  if (!Array.isArray(transformed.features)) {
    return transformed;
  }

  transformed.features = transformed.features.map((feature) => {
    if (typeof feature !== "object" || feature === null || !("feature_ref" in feature)) {
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
