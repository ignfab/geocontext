import { fetchJSONGet, ServiceResponseError } from "../helpers/http.js";
import logger from "../logger.js";
import type { JsonFetcher } from "../helpers/http.js";
import type { RateLimiter } from "../helpers/RateLimiter.js";
import { getNavigationRateLimiter } from "./navigationRateLimiter.js";
import { NAVIGATION_METRICS, NAVIGATION_PROFILES, NAVIGATION_ISOLINE_RESOURCE } from "./navigation.js";
import type { LineString } from "geojson";
import { isGeometryLike } from "../helpers/geojson.js";

export const NAVIGATION_ITINERARY_SOURCE = "Géoplateforme (calcul d'itinéraire)";
export const NAVIGATION_ITINERARY_URL = "https://data.geopf.fr/navigation/itineraire";
// Same engine as the `isoline_filter`, so that both report the same travel times.
export const ITINERARY_RESOURCE = NAVIGATION_ISOLINE_RESOURCE;
export const ITINERARY_PROFILES = NAVIGATION_PROFILES;
export const ITINERARY_METRICS = NAVIGATION_METRICS;

export type ItineraryProfile = typeof ITINERARY_PROFILES[number];
export type ItineraryMetric = typeof ITINERARY_METRICS[number];

/**
 * Maximum crow-flies distance accepted between departure and arrival with `pedestrian`,
 * under the upstream's own limit (~250 km, beyond which it answers "No path found").
 * `car` has no upstream limit.
 */
export const ITINERARY_PEDESTRIAN_MAX_DIRECT_DISTANCE_METERS = 200_000;

type ItineraryResponse = {
  distance: number;
  duration: number;
};

export type ItineraryLayerResponse = ItineraryResponse & { geometry: LineString; };

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
    throw new ServiceResponseError(
      "Le service d'itinéraire n'a pas renvoyé de distance et de durée exploitables.",
      {
        http: { status: 502, statusText: "Bad Gateway" },
        service: { code: "invalid_upstream_body", detail: "distance/duration manquantes ou non numériques" },
      },
    );
  }
  return { distance, duration };
}

/**
 * Rounds the itinerary distance (to the cm) and duration (to the tenth of a minute),
 * so every tool reports identical figures.
 */
export function roundItineraryCosts({ distance, duration }: ItineraryResponse) {
  return {
    distance: Math.round(distance * 100) / 100,
    time: Math.round(duration * 10) / 10,
  };
}

export class NavigationItineraryClient {
  constructor(
    private rateLimiter: RateLimiter,
    private fetcher: JsonFetcher<{distance?: unknown; duration?: unknown; geometry?: unknown}> = fetchJSONGet,
  ) {}

  async getItinerary(input: ItineraryInput): Promise<ItineraryResponse> {
    await this.rateLimiter.limit();
    logger.debug(`[gpf:navigation] getItinerary(${JSON.stringify(input)})...`);

    // polyline format minimizes response size; geometry is discarded anyway
    const result = await this.fetcher(buildItineraryUrl(input, "polyline"));
    return parseItineraryCosts(result.distance, result.duration);
  }

  /**
   * Requests the route with `geometryFormat: "geojson"` so the response includes the route geometry
   * (a LineString) alongside distance and duration.
   */
  async getItineraryLayer(input: ItineraryInput): Promise<ItineraryLayerResponse> {
    await this.rateLimiter.limit();
    logger.debug(`[gpf:navigation] getItineraryLayer(${JSON.stringify(input)})...`);

    const result = await this.fetcher(buildItineraryUrl(input, "geojson"));
    if (!(isGeometryLike(result.geometry) && result.geometry.type === "LineString" && result.geometry.coordinates.length >= 2)) {
      throw new ServiceResponseError(
        "Le service d'itinéraire n'a pas renvoyé de LineString exploitable.",
        {
          http: { status: 502, statusText: "Bad Gateway" },
          service: { code: "invalid_upstream_body", detail: "geometry manquante ou non-LineString" },
        },
      );
    }
    return {
      geometry: result.geometry,
      ...parseItineraryCosts(result.distance, result.duration),
    };
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
