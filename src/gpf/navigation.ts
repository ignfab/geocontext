import { fetchJSONGet } from "../helpers/http.js";
import logger from "../logger.js";
import type { JsonFetcher } from "../helpers/http.js";
import type { Geometry } from "geojson";
import { isGeometryLike } from "../helpers/geojson.js";
import type { RateLimiter } from "../helpers/RateLimiter.js";
import { getNavigationRateLimiter } from "./navigationRateLimiter.js";

export const NAVIGATION_SOURCE = "Géoplateforme (calcul d'isochrone / d'isodistance)";
export const NAVIGATION_ISOCHRONE_URL = "https://data.geopf.fr/navigation/isochrone";
export const NAVIGATION_ISOCHRONE_RESOURCE = "bdtopo-valhalla";
// Upstream ceilings accepted by the GPF isochrone service, per cost type.
export const NAVIGATION_MAX_TIME_MINUTES = 600;
export const NAVIGATION_MAX_DISTANCE_METERS = 50_000;
export const NAVIGATION_PROFILES = ["car", "pedestrian"] as const;
export const NAVIGATION_COST_TYPES = ["time", "distance"] as const;

export type NavigationProfile = typeof NAVIGATION_PROFILES[number];
export type NavigationCostType = typeof NAVIGATION_COST_TYPES[number];

export type IsolineGeometryInput = {
  lon: number;
  lat: number;
  costType: NavigationCostType;
  costValue: number;
  profile: NavigationProfile;
};

export class NavigationIsochroneClient {
  constructor(
    private rateLimiter: RateLimiter,
    private fetcher: JsonFetcher<{geometry?: unknown}> = fetchJSONGet,
  ) {}

  async getGeometry(input: IsolineGeometryInput): Promise<Geometry> {
    await this.rateLimiter.limit();
    logger.debug(`[gpf:navigation] getGeometry(${JSON.stringify(input)})...`);

    const url = `${NAVIGATION_ISOCHRONE_URL}?${new URLSearchParams({
      resource: NAVIGATION_ISOCHRONE_RESOURCE,
      point: `${input.lon},${input.lat}`,
      direction: "departure",
      costType: input.costType,
      costValue: String(input.costValue),
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
  defaultNavigationIsochroneClient ??= new NavigationIsochroneClient(getNavigationRateLimiter());
  return defaultNavigationIsochroneClient;
}

export const navigationIsochroneClient = {
  getGeometry(input: IsolineGeometryInput) {
    return getDefaultNavigationIsochroneClient().getGeometry(input);
  },
};
