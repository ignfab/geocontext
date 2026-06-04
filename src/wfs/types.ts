export type WfsFeatureResponse = {
  type?: "Feature";
  id?: string;
  geometry?: unknown;
  geometry_name?: string;
  properties?: Record<string, unknown>;
  [key: string]: unknown;
};

export type WfsFeatureCollectionResponse = Record<string, unknown> & {
  features?: WfsFeatureResponse[];
  totalFeatures?: number;
  numberMatched?: number | "unknown";
  numberReturned?: number;
};
