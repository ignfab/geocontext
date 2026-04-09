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
 * Removes raw geometry payloads from a FeatureCollection and exposes lightweight `feature_ref`
 * objects that can be reused by follow-up requests.
 *
 * @param featureCollection Raw FeatureCollection returned by the WFS endpoint.
 * @returns A transformed FeatureCollection with `geometry` nulled out and optional `feature_ref` metadata.
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

  return {
    ...featureCollection,
    features: transformedFeatures,
  };
}
