import { fetchJSONGet } from "../helpers/http.js";
import logger from "../logger.js";
import type { JsonFetcher } from "../helpers/http.js";
import { RateLimiter } from "../helpers/RateLimiter.js";
import { getEnv } from "../config/env.js";

export const POINTSDINTERET_SOURCE = "Géoplateforme (service de géocodage)";

type RawPointsDInteretFeature = {
  properties: {
    toponym: string;
    category: string[];
    city?: string[];
    postcode?: string[];
    distance: number;
  };
  geometry: {
    type: string;
    coordinates: number[];
  };
}

export type PointsDInteretResult = {
  name: string;
  categories: string[];
  city?: string;
  zipcode?: string;
  distance: number;
  centroid?: {
    lon: number,
    lat: number
  };
};

type RawPointsDInteretResponse = {
  features?: RawPointsDInteretFeature[];
};

export class PointsDInteretClient {
  constructor(
    private rateLimiter: RateLimiter,
    private fetcher: JsonFetcher<RawPointsDInteretResponse> = fetchJSONGet,
  ) {}

  /**
   * Get the nearest points of interest for given coordinates
   *
   * @see https://geoservices.ign.fr/documentation/services/services-geoplateforme/geocodage
   */
  async pointsdinteret(lon: number, lat: number, maximumResponses = 3): Promise<PointsDInteretResult[]> {
    await this.rateLimiter.limit();
    logger.debug(`[gpf:pointsdinteret] pointsdinteret(${lon}, ${lat}, ${maximumResponses})...`);

    const url = 'https://data.geopf.fr/geocodage/reverse/?' + new URLSearchParams({
      lon: String(lon),
      lat: String(lat),
      index: "poi", // we could also include "parcel" but it is redundant with the cadastre tool
      limit: String(maximumResponses),
    }).toString();

    const json: RawPointsDInteretResponse = await this.fetcher(url);
    const results = Array.isArray(json?.features) ? json.features : [];
    return results.map((item) => ({
      name: item.properties.toponym,
      categories: item.properties.category,
      city: Array.isArray(item.properties.city) ? item.properties.city[0] : undefined,
      zipcode: Array.isArray(item.properties.postcode) ? item.properties.postcode[0] : undefined,
      distance: item.properties.distance,
      centroid: item.geometry.type == "Point" ? {
        lon: item.geometry.coordinates[0],
        lat: item.geometry.coordinates[1]
      } : undefined,
    }));
  }
}

export const pointsdinteretClient = new PointsDInteretClient(
  new RateLimiter({ name: "GPF_POINTSDINTERET", maxCalls: getEnv().GPF_GEOCODE_RATE_LIMIT, period: 1 }),
);
