import { fetchJSONGet } from "../helpers/http.js";
import logger from "../logger.js";
import type { JsonFetcher } from "../helpers/http.js";
import type { RateLimiter } from "../helpers/RateLimiter.js";
import { getNavigationRateLimiter } from "./navigationRateLimiter.js";

export const NAVIGATION_ITINERARY_SOURCE = "Géoplateforme (calcul d'itinéraire)";
export const NAVIGATION_ITINERARY_URL = "https://data.geopf.fr/navigation/itineraire";
export const ITINERARY_RESOURCE = "bdtopo-osrm";
export const ITINERARY_PROFILES = ["car", "pedestrian"] as const;
export const ITINERARY_METRICS = ["time", "distance"] as const;

export type ItineraryProfile = typeof ITINERARY_PROFILES[number];
export type ItineraryMetrics = typeof ITINERARY_METRICS[number];

type ItineraryResponse = {
  distance: number;
  duration: number;
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
  shortest?: ItineraryMetrics;
};

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
      optimization: input.shortest == "distance" ? "shortest" : "fastest",
      timeUnit: "minute",
      distanceUnit: "meter",
      crs: "EPSG:4326",
      geometryFormat: "polyline", // polyline format minimizes response size; geometry is discarded anyway
      getSteps: "false",
      getBbox: "false",
    });
    const url = `${NAVIGATION_ITINERARY_URL}?${urlsearch.toString()}`;

    const result = await this.fetcher(url);
    if (typeof result.distance !== "number" || typeof result.duration !== "number") {
      throw new Error(`Invalid itinerary response: distance=${result.distance}, duration=${result.duration}`);
    }
    return result;
  }
}

let defaultNavigationItineraryClient: NavigationItineraryClient | undefined;

function getDefaultNavigationItineraryClient() {
  defaultNavigationItineraryClient ??= new NavigationItineraryClient(getNavigationRateLimiter());
  return defaultNavigationItineraryClient;
}

export const navigationItineraryClient = {
  getItinerary(input: ItineraryGeometryInput) {
    return getDefaultNavigationItineraryClient().getItinerary(input);
  },
};
