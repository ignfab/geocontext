import { fetchJSONGet } from "../helpers/http.js";
import logger from "../logger.js";
import type { JsonFetcher } from "../helpers/http.js";
import type { RateLimiter } from "../helpers/RateLimiter.js";
import { getNavigationRateLimiter } from "./navigationRateLimiter.js";
import { TRAVEL_TIME_PROFILES } from "./navigation.js";

export const NAVIGATION_ITINERARY_SOURCE = "Géoplateforme (calcul d'itinéraire)";
export const NAVIGATION_ITINERARY_URL = "https://data.geopf.fr/navigation/itineraire";
export const ITINERARY_RESOURCE = "bdtopo-osrm";
export const ITINERARY_PROFILES = TRAVEL_TIME_PROFILES;
export const ITINERARY_METRICS = ["time", "distance"] as const;

export type ItineraryProfile = typeof ITINERARY_PROFILES[number];
export type ItineraryMetric = typeof ITINERARY_METRICS[number];

type ItineraryResponse = {
  distance: number;
  duration: number;
};

export type ItineraryInput = {
  departure: {
    lon: number;
    lat: number;
  };
  arrival: {
    lon: number;
    lat: number;
  };
  profile: ItineraryProfile;
  optimize?: ItineraryMetric;
};

/**
 * Builds the itinerary request URL.
 */
function buildItineraryUrl(input: ItineraryInput, geometryFormat: "polyline" | "geojson"): string {
  return `${NAVIGATION_ITINERARY_URL}?${new URLSearchParams({
    resource: ITINERARY_RESOURCE,
    start: `${input.departure.lon},${input.departure.lat}`,
    end: `${input.arrival.lon},${input.arrival.lat}`,
    profile: input.profile,
    optimization: input.optimize === "distance" ? "shortest" : "fastest",
    timeUnit: "minute",
    distanceUnit: "meter",
    crs: "EPSG:4326",
    geometryFormat,
    getSteps: "false",
    getBbox: "false",
  }).toString()}`;
}

/**
 * Validates the distance and duration returned by the itinerary service.
 */
function parseItineraryCosts(distance: unknown, duration: unknown): ItineraryResponse {
  if (typeof distance !== "number" || typeof duration !== "number") {
    throw new Error("Le service d'itinéraire n'a pas renvoyé de distance et de durée exploitables.");
  }
  return { distance, duration };
}

export class NavigationItineraryClient {
  constructor(
    private rateLimiter: RateLimiter,
    private fetcher: JsonFetcher<{distance?: unknown; duration?: unknown}> = fetchJSONGet,
  ) {}

  async getItinerary(input: ItineraryInput): Promise<ItineraryResponse> {
    await this.rateLimiter.limit();
    logger.debug(`[gpf:navigation] getItinerary(${JSON.stringify(input)})...`);

    // polyline format minimizes response size; geometry is discarded anyway
    const result = await this.fetcher(buildItineraryUrl(input, "polyline"));
    return parseItineraryCosts(result.distance, result.duration);
  }
}

let defaultNavigationItineraryClient: NavigationItineraryClient | undefined;

function getDefaultNavigationItineraryClient() {
  defaultNavigationItineraryClient ??= new NavigationItineraryClient(getNavigationRateLimiter());
  return defaultNavigationItineraryClient;
}

export const navigationItineraryClient = {
  getItinerary(input: ItineraryInput) {
    return getDefaultNavigationItineraryClient().getItinerary(input);
  },
};
