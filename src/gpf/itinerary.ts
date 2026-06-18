import { fetchJSONGet } from "../helpers/http.js";
import logger from "../logger.js";
import type { JsonFetcher } from "../helpers/http.js";
import { RateLimiter } from "../helpers/RateLimiter.js";
import { getEnv } from "../config/env.js";

export const NAVIGATION_ITINERARY_SOURCE = "Géoplateforme (calcul d'itinéraire)";
export const NAVIGATION_ITINERARY_URL = "https://data.geopf.fr/navigation/itineraire";
export const ITINERARY_RESOURCE = "bdtopo-osrm";
export const ITINERARY_PROFILES = ["car", "pedestrian"] as const;

export type ItineraryProfile = typeof ITINERARY_PROFILES[number];

type GeoJsonGeometryLike = {
  type: string;
  coordinates: unknown;
};

type ItineraryResponse = {
  distance: number;
  duration: number;
  geometry?: unknown;
};

export type ItineraryGeometryInput = {
  departure: {
    lon: number;
    lat: number;
  },
  arrival: {
    lon: number;
    lat: number;
  }
  profile: ItineraryProfile;
  needGeometry?: boolean;
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

export class NavigationItineraryClient {
  constructor(
    private rateLimiter: RateLimiter,
    private fetcher: JsonFetcher<ItineraryResponse> = fetchJSONGet,
  ) {}

  async getItinerary(input: ItineraryGeometryInput): Promise<ItineraryResponse> {
    await this.rateLimiter.limit();
    logger.debug(`[gpf:navigation] getItinerary(${JSON.stringify(input)})...`);

    const urlsearch = new URLSearchParams({
      resource: ITINERARY_RESOURCE,
      start: `${input.departure.lon},${input.departure.lat}`,
      end: `${input.arrival.lon},${input.arrival.lat}`,
      profile: input.profile,
      optimization: "fastest",
      timeUnit: "minute",
      distanceUnit: "meter",
      crs: "EPSG:4326",
      geometryFormat: input.needGeometry ? "geojson" : "polyline", // polyline is much more compact
      getSteps: "false",
      getBbox: "false",
    });
    urlsearch.append('waysAttributes', "name")
    const url = `${NAVIGATION_ITINERARY_URL}?${urlsearch.toString()}`;

    const json = await this.fetcher(url);
    if (!input.needGeometry || !isGeoJsonGeometryLike(json.geometry)) {
      json.geometry = null;
    }

    return json;
  }
}

let defaultNavigationItineraryClient: NavigationItineraryClient | undefined;

function getDefaultNavigationItineraryClient() {
  defaultNavigationItineraryClient ??= new NavigationItineraryClient(
    new RateLimiter({ name: "GPF_NAVIGATION", maxCalls: getEnv().GPF_NAVIGATION_RATE_LIMIT, period: 1 }),
  );
  return defaultNavigationItineraryClient;
}

export const navigationItineraryClient = {
  getItinerary(input: ItineraryGeometryInput) {
    return getDefaultNavigationItineraryClient().getItinerary(input);
  },
};
