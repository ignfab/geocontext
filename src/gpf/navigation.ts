import { fetchJSONGet } from "../helpers/http.js";
import logger from "../logger.js";
import type { JsonFetcher } from "../helpers/http.js";
import { RateLimiter } from "../helpers/RateLimiter.js";
import { getEnv } from "../config/env.js";
import { Geometry } from "geojson";
import { isGeometryLike } from "../helpers/geojson.js";

export const NAVIGATION_SOURCE = "Géoplateforme (calcul d'isochrone)";
export const NAVIGATION_ISOCHRONE_URL = "https://data.geopf.fr/navigation/isochrone";
export const TRAVEL_TIME_RESOURCE = "bdtopo-valhalla";
export const TRAVEL_TIME_MAX_MINUTES = 120;
export const TRAVEL_TIME_PROFILES = ["car", "pedestrian"] as const;

export type TravelTimeProfile = typeof TRAVEL_TIME_PROFILES[number];


export type TravelTimeGeometryInput = {
  lon: number;
  lat: number;
  minutes: number;
  profile: TravelTimeProfile;
};

export class NavigationIsochroneClient {
  constructor(
    private rateLimiter: RateLimiter,
    private fetcher: JsonFetcher<{geometry?: unknown}> = fetchJSONGet,
  ) {}

  async getTravelTimeGeometry(input: TravelTimeGeometryInput): Promise<Geometry> {
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
    if (!isGeometryLike(json.geometry)) {
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
