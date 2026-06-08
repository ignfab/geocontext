import { fetchJSONGet } from "../helpers/http.js";
import logger from "../logger.js";
import type { JsonFetcher } from "../helpers/http.js";
import { RateLimiter } from "../helpers/RateLimiter.js";
import { getEnv } from "../config/env.js";

export const NAVIGATION_SOURCE = "Géoplateforme (calcul d'isochrone)";
export const NAVIGATION_ISOCHRONE_URL = "https://data.geopf.fr/navigation/isochrone";
export const TRAVEL_TIME_RESOURCE = "bdtopo-valhalla";
export const TRAVEL_TIME_MAX_MINUTES = 120;
export const TRAVEL_TIME_PROFILES = ["car", "pedestrian"] as const;

export type TravelTimeProfile = typeof TRAVEL_TIME_PROFILES[number];

type GeoJsonGeometryLike = {
  type: string;
  coordinates: unknown;
};

type RawIsochroneResponse = {
  geometry?: unknown;
};

export type TravelTimeGeometryInput = {
  lon: number;
  lat: number;
  minutes: number;
  profile: TravelTimeProfile;
};

function isGeoJsonGeometryLike(value: unknown): value is GeoJsonGeometryLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string" &&
    "coordinates" in value
  );
}

export class NavigationIsochroneClient {
  constructor(
    private rateLimiter: RateLimiter,
    private fetcher: JsonFetcher<RawIsochroneResponse> = fetchJSONGet,
  ) {}

  async getTravelTimeGeometry(input: TravelTimeGeometryInput): Promise<GeoJsonGeometryLike> {
    await this.rateLimiter.limit();
    logger.debug(`[gpf:navigation] getTravelTimeGeometry(${JSON.stringify(input)})...`);

    const url = `${NAVIGATION_ISOCHRONE_URL}?${new URLSearchParams({
      resource: TRAVEL_TIME_RESOURCE,
      point: `${input.lon},${input.lat}`,
      direction: "departure",
      costType: "time",
      costValue: String(input.minutes),
      profile: input.profile,
      timeUnit: "minute",
      distanceUnit: "meter",
      crs: "EPSG:4326",
      geometryFormat: "geojson",
    }).toString()}`;

    const json = await this.fetcher(url);
    if (!isGeoJsonGeometryLike(json.geometry)) {
      throw new Error("Le service d'isochrone n'a pas renvoyé de géométrie GeoJSON exploitable.");
    }

    return json.geometry;
  }
}

let defaultNavigationIsochroneClient: NavigationIsochroneClient | undefined;

function getDefaultNavigationIsochroneClient() {
  defaultNavigationIsochroneClient ??= new NavigationIsochroneClient(
    new RateLimiter({ name: "GPF_NAVIGATION", maxCalls: getEnv().GPF_NAVIGATION_RATE_LIMIT, period: 1 }),
  );
  return defaultNavigationIsochroneClient;
}

export const navigationIsochroneClient = {
  getTravelTimeGeometry(input: TravelTimeGeometryInput) {
    return getDefaultNavigationIsochroneClient().getTravelTimeGeometry(input);
  },
};
