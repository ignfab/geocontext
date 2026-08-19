import { fetchJSONGet } from "../helpers/http.js";
import logger from "../logger.js";
import type { JsonFetcher } from "../helpers/http.js";
import type { RateLimiter } from "../helpers/RateLimiter.js";
import { NAVIGATION_COST_TYPES, type NavigationProfile, type GeoJsonGeometryLike, isGeoJsonGeometryLike } from "./navigation.js";

export const NAVIGATION_ITINERARY_SOURCE = "Géoplateforme (calcul d'itinéraire)";
export const NAVIGATION_ITINERARY_URL = "https://data.geopf.fr/navigation/itineraire";
export const ITINERARY_RESOURCE = "bdtopo-osrm";

/**
 * Maximum crow-flies distance accepted between departure and arrival. Caps the
 * upstream compute and the size of the returned LineString: a route this long
 * already yields thousands of vertices.
 */
export const ITINERARY_MAX_DIRECT_DISTANCE_METERS = 100_000;

// Same travel modes and same cost metrics as the isoline service
export type ItineraryProfile = NavigationProfile;
export type ItineraryMetric = typeof NAVIGATION_COST_TYPES[number];

export type ItineraryGeometryInput = {
  departure: {
    lon: number;
    lat: number;
  };
  arrival: {
    lon: number;
    lat: number;
  };
  profile: ItineraryProfile;
  /** Metric the route is optimized for: `time` (fastest) or `distance` (shortest). Defaults to `time`. */
  optimize?: ItineraryMetric;
};

/**
 * Builds the itinerary request URL.
 */
function buildItineraryUrl(input: ItineraryGeometryInput): string {
  const urlsearch = new URLSearchParams({
    resource: ITINERARY_RESOURCE,
    start: `${input.departure.lon},${input.departure.lat}`,
    end: `${input.arrival.lon},${input.arrival.lat}`,
    profile: input.profile,
    optimization: input.optimize === "distance" ? "shortest" : "fastest",
    timeUnit: "minute",
    distanceUnit: "meter",
    crs: "EPSG:4326",
    geometryFormat: "geojson",
    getSteps: "false",
    getBbox: "false",
  });
  return `${NAVIGATION_ITINERARY_URL}?${urlsearch.toString()}`;
}

/**
 * Validates the numeric cost fields the client promises its callers, and returns them
 * narrowed. Throws if the service omitted either one.
 */
function parseItineraryCosts(distance: unknown, duration: unknown): { distance: number; duration: number } {
  if (typeof distance !== "number" || typeof duration !== "number") {
    throw new Error(
      `Le service d'itinéraire n'a pas renvoyé de distance et de durée exploitables (distance=${distance}, duration=${duration}).`,
    );
  }
  return { distance, duration };
}

type ItineraryLayerRawResponse = {
  geometry?: unknown;
  distance?: unknown;
  duration?: unknown;
};

export type ItineraryWithGeometryResult = {
  geometry: GeoJsonGeometryLike;
  distance: number;
  duration: number;
};

/**
 * Client for the itinerary layer tool. Requests the route with `geometryFormat: "geojson"`
 * so the response includes the route geometry (a LineString) alongside distance and duration.
 */
export class NavigationItineraryLayerClient {
  constructor(
    private rateLimiter: RateLimiter,
    private fetcher: JsonFetcher<ItineraryLayerRawResponse> = fetchJSONGet,
  ) {}

  async getItineraryWithGeometry(input: ItineraryGeometryInput): Promise<ItineraryWithGeometryResult> {
    await this.rateLimiter.limit();
    logger.debug(`[gpf:navigation] getItineraryWithGeometry(${JSON.stringify(input)})...`);

    const result = await this.fetcher(buildItineraryUrl(input));
    if (!isGeoJsonGeometryLike(result.geometry)) {
      throw new Error("Le service d'itinéraire n'a pas renvoyé de géométrie GeoJSON exploitable.");
    }
    return {
      geometry: result.geometry,
      ...parseItineraryCosts(result.distance, result.duration),
    };
  }
}
