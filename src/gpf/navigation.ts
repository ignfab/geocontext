import { fetchJSONGet, ServiceResponseError } from "../helpers/http.js";
import logger from "../logger.js";
import type { JsonFetcher } from "../helpers/http.js";
import type { Geometry } from "geojson";
import { isGeometryLike } from "../helpers/geojson.js";
import type { RateLimiter } from "../helpers/RateLimiter.js";
import { getNavigationRateLimiter } from "./navigationRateLimiter.js";

export const NAVIGATION_SOURCE = "Géoplateforme (calcul d'isochrone / d'isodistance)";
export const NAVIGATION_ISOLINE_URL = "https://data.geopf.fr/navigation/isochrone";
export const NAVIGATION_ISOLINE_RESOURCE = "bdtopo-valhalla";
// Upstream ceilings accepted by the GPF isochrone service, per cost type.
export const NAVIGATION_ISOCHRONE_MAX_MINUTES = 600;
export const NAVIGATION_ISODISTANCE_MAX_METERS = 50_000;
export const NAVIGATION_PROFILES = ["car", "pedestrian"] as const;
export const NAVIGATION_METRICS = ["time", "distance"] as const;

export const TRAVEL_TIME_MAX_MINUTES = 120;

export type NavigationProfile = typeof NAVIGATION_PROFILES[number];
export type NavigationMetric = typeof NAVIGATION_METRICS[number];

export type IsolineInput = {
  lon: number;
  lat: number;
  cost_type: NavigationMetric;
  cost_value: number;
  profile: NavigationProfile;
};

export class NavigationIsolineClient {
  constructor(
    private rateLimiter: RateLimiter,
    private fetcher: JsonFetcher<{geometry?: unknown}> = fetchJSONGet,
  ) {}

  async getIsoline(input: IsolineInput): Promise<Geometry> {
    await this.rateLimiter.limit();
    logger.debug(`[gpf:navigation] getIsoline(${JSON.stringify(input)})...`);

    const url = `${NAVIGATION_ISOLINE_URL}?${new URLSearchParams({
      resource: NAVIGATION_ISOLINE_RESOURCE,
      point: `${input.lon},${input.lat}`,
      direction: "departure",
      costType: input.cost_type,
      costValue: String(input.cost_value),
      profile: input.profile,
      timeUnit: "minute",
      distanceUnit: "meter",
      crs: "EPSG:4326",
      geometryFormat: "geojson",
    }).toString()}`;

    const json = await this.fetcher(url);
    if (!isGeometryLike(json.geometry)) {
      throw new ServiceResponseError("Le service d'isochrone n'a pas renvoyé de géométrie GeoJSON exploitable.", {
        http: { status: 502, statusText: "Bad Gateway" },
      });
    }

    return json.geometry;
  }
}

let defaultNavigationIsolineClient: NavigationIsolineClient | undefined;

function getDefaultNavigationIsolineClient() {
  defaultNavigationIsolineClient ??= new NavigationIsolineClient(getNavigationRateLimiter());
  return defaultNavigationIsolineClient;
}

export const navigationIsolineClient = {
  getIsoline(input: IsolineInput) {
    return getDefaultNavigationIsolineClient().getIsoline(input);
  },
};
