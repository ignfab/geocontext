import type { Feature, FeatureCollection, Geometry } from "geojson";

import { fetchJSONGet } from "../helpers/http.js";
import logger from "../logger.js";
import type { JsonFetcher } from "../helpers/http.js";

export const ISOCHRONE_SOURCE = "Géoplateforme (navigation, isochrone/isodistance)";
export const ISOCHRONE_URL = "https://data.geopf.fr/navigation/isochrone";

export const ISOCHRONE_DEFAULTS = {
  resource: "bdtopo-valhalla",
  profile: "pedestrian",
  direction: "departure",
  distance_unit: "meter",
  time_unit: "second",
  crs: "EPSG:4326",
} as const;

export type IsochroneCostType = "time" | "distance";
export type IsochroneResource = typeof ISOCHRONE_DEFAULTS.resource;
export type IsochroneProfile = "car" | "pedestrian";
export type IsochroneDirection = "departure" | "arrival";
export type IsochroneDistanceUnit = "meter" | "kilometer";
export type IsochroneTimeUnit = "hour" | "minute" | "second" | "standard";

export type IsochroneConstraintType = "banned";
export type IsochroneConstraintKey = "waytype";
export type IsochroneConstraintOperator = "=";
export type IsochroneConstraintValue = "autoroute" | "pont" | "tunnel";

export type IsochroneConstraint = {
  constraint_type: IsochroneConstraintType;
  key: IsochroneConstraintKey;
  operator: IsochroneConstraintOperator;
  value: IsochroneConstraintValue;
};

export type IsochroneRequestInput = {
  lon: number;
  lat: number;
  cost_type: IsochroneCostType;
  cost_value: number;
  resource?: IsochroneResource;
  profile?: IsochroneProfile;
  direction?: IsochroneDirection;
  distance_unit?: IsochroneDistanceUnit;
  time_unit?: IsochroneTimeUnit;
  constraints?: IsochroneConstraint[];
};

type NormalizedIsochroneInput = Required<Omit<IsochroneRequestInput, "constraints">> & {
  crs: string;
  constraints: IsochroneConstraint[];
};

export type IsochroneCompiledRequest = {
  result_type?: "request";
  method: "GET";
  url: string;
  query: Record<string, string>;
  body: "";
  get_url: string;
};

type RawIsochroneResponse = {
  point?: string;
  resource?: string;
  resourceVersion?: string;
  costType?: string;
  costValue?: number;
  distanceUnit?: string;
  timeUnit?: string;
  profile?: string;
  direction?: string;
  crs?: string;
  geometry?: unknown;
  constraints?: unknown;
  alerts?: unknown;
};

type IsochroneFeatureProperties = {
  source: string;
  point: string;
  resource: string;
  resourceVersion?: string;
  costType: string;
  costValue: number;
  distanceUnit?: string;
  timeUnit?: string;
  profile: string;
  direction: string;
  crs: string;
  constraints?: unknown;
  alerts?: unknown;
};

export type IsochroneFeatureCollection = FeatureCollection<Geometry, IsochroneFeatureProperties>;

/**
 * Applies stable client-side defaults used by the MCP tool.
 *
 * @param input Raw isochrone request input.
 * @returns Input completed with default navigation options.
 */
function normalizeIsochroneInput(input: IsochroneRequestInput): NormalizedIsochroneInput {
  return {
    lon: input.lon,
    lat: input.lat,
    cost_type: input.cost_type,
    cost_value: input.cost_value,
    resource: input.resource ?? ISOCHRONE_DEFAULTS.resource,
    profile: input.profile ?? ISOCHRONE_DEFAULTS.profile,
    direction: input.direction ?? ISOCHRONE_DEFAULTS.direction,
    distance_unit: input.distance_unit ?? ISOCHRONE_DEFAULTS.distance_unit,
    time_unit: input.time_unit ?? ISOCHRONE_DEFAULTS.time_unit,
    crs: ISOCHRONE_DEFAULTS.crs,
    constraints: input.constraints ?? [],
  };
}

/**
 * Converts MCP-facing constraint keys to the upstream GeoPlateforme shape.
 *
 * @param constraint Constraint supplied to the MCP tool.
 * @returns Constraint encoded with upstream field names.
 */
function toUpstreamConstraint(constraint: IsochroneConstraint) {
  return {
    constraintType: constraint.constraint_type,
    key: constraint.key,
    operator: constraint.operator,
    value: constraint.value,
  };
}

/**
 * Serializes constraints using the pipe-delimited style advertised by the upstream API.
 *
 * @param constraints Constraints supplied to the MCP tool.
 * @returns Pipe-delimited JSON objects, or `undefined` when there are no constraints.
 */
function serializeConstraints(constraints: IsochroneConstraint[]) {
  if (constraints.length === 0) {
    return undefined;
  }
  return constraints.map((constraint) => JSON.stringify(toUpstreamConstraint(constraint))).join("|");
}

/**
 * Builds the GeoPlateforme isochrone GET request without executing it.
 *
 * @param input Raw isochrone request input.
 * @returns The compiled GET request and reusable URL.
 */
export function buildIsochroneRequest(input: IsochroneRequestInput): IsochroneCompiledRequest {
  const normalizedInput = normalizeIsochroneInput(input);
  const query: Record<string, string> = {
    resource: normalizedInput.resource,
    point: `${normalizedInput.lon},${normalizedInput.lat}`,
    costType: normalizedInput.cost_type,
    costValue: String(normalizedInput.cost_value),
    profile: normalizedInput.profile,
    direction: normalizedInput.direction,
    distanceUnit: normalizedInput.distance_unit,
    timeUnit: normalizedInput.time_unit,
    crs: normalizedInput.crs,
    geometryFormat: "geojson",
  };

  const serializedConstraints = serializeConstraints(normalizedInput.constraints);
  if (serializedConstraints) {
    query.constraints = serializedConstraints;
  }

  const getUrl = `${ISOCHRONE_URL}?${new URLSearchParams(query).toString()}`;

  return {
    method: "GET",
    url: ISOCHRONE_URL,
    query,
    body: "",
    get_url: getUrl,
  };
}

/**
 * Maps a compiled request to the compact MCP `result_type="request"` payload.
 *
 * @param request Compiled isochrone request.
 * @returns A compact request payload consistent with WFS request-mode tools.
 */
export function toIsochroneRequestPayload(request: IsochroneCompiledRequest): Required<IsochroneCompiledRequest> {
  return {
    result_type: "request",
    method: request.method,
    url: request.url,
    query: request.query,
    body: request.body,
    get_url: request.get_url,
  };
}

/**
 * Checks whether a value looks like a GeoJSON geometry returned by the upstream service.
 *
 * @param value Unknown upstream geometry.
 * @returns `true` when the value has the minimal GeoJSON geometry shape.
 */
function isGeoJsonGeometry(value: unknown): value is Geometry {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.type === "string" && Array.isArray(record.coordinates);
}

/**
 * Normalizes the upstream isochrone envelope into a single-feature GeoJSON FeatureCollection.
 *
 * @param raw Upstream GeoPlateforme response.
 * @param input Original request input, used as a fallback for metadata fields.
 * @returns A GeoJSON FeatureCollection containing the computed isochrone geometry.
 */
export function normalizeIsochroneResponse(
  raw: RawIsochroneResponse,
  input: IsochroneRequestInput,
): IsochroneFeatureCollection {
  const normalizedInput = normalizeIsochroneInput(input);

  if (raw.geometry === undefined || raw.geometry === null) {
    throw new Error("Le service d'isochrone n'a renvoyé aucune géométrie.");
  }
  if (!isGeoJsonGeometry(raw.geometry)) {
    throw new Error("La géométrie renvoyée par le service d'isochrone est invalide.");
  }

  const properties: IsochroneFeatureProperties = {
    source: ISOCHRONE_SOURCE,
    point: raw.point ?? `${normalizedInput.lon},${normalizedInput.lat}`,
    resource: raw.resource ?? normalizedInput.resource,
    ...(raw.resourceVersion ? { resourceVersion: raw.resourceVersion } : {}),
    costType: raw.costType ?? normalizedInput.cost_type,
    costValue: raw.costValue ?? normalizedInput.cost_value,
    ...(raw.distanceUnit ? { distanceUnit: raw.distanceUnit } : { distanceUnit: normalizedInput.distance_unit }),
    ...(raw.timeUnit ? { timeUnit: raw.timeUnit } : { timeUnit: normalizedInput.time_unit }),
    profile: raw.profile ?? normalizedInput.profile,
    direction: raw.direction ?? normalizedInput.direction,
    crs: raw.crs ?? normalizedInput.crs,
    ...(raw.constraints !== undefined ? { constraints: raw.constraints } : {}),
    ...(raw.alerts !== undefined ? { alerts: raw.alerts } : {}),
  };

  const feature: Feature<Geometry, IsochroneFeatureProperties> = {
    type: "Feature",
    properties,
    geometry: raw.geometry,
  };

  return {
    type: "FeatureCollection",
    features: [feature],
  };
}

/**
 * Computes an isochrone or isodistance from the GeoPlateforme navigation service.
 *
 * @param input Raw isochrone request input.
 * @param fetcher Optional JSON fetcher for tests.
 * @returns A normalized single-feature GeoJSON FeatureCollection.
 */
export async function getIsochrone(
  input: IsochroneRequestInput,
  fetcher: JsonFetcher<RawIsochroneResponse> = fetchJSONGet,
): Promise<IsochroneFeatureCollection> {
  logger.debug(`[gpf:isochrone] getIsochrone(${JSON.stringify(input)})...`);

  const request = buildIsochroneRequest(input);
  const json = await fetcher(request.get_url);
  return normalizeIsochroneResponse(json, input);
}
