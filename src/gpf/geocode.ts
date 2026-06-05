import { fetchJSONGet } from "../helpers/http.js";
import logger from "../logger.js";
import type { JsonFetcher } from "../helpers/http.js";
import { RateLimiter } from "../helpers/RateLimiter.js";
import { getEnv } from "../config/env.js";

export const GEOCODE_SOURCE = "Géoplateforme (service d'autocomplétion)";

type RawGeocodeResult = {
  x: number;
  y: number;
  fulltext: string;
  kind: string;
  city: string;
  zipcode: string;
};

export type GeocodeResult = {
  lon: number;
  lat: number;
  fulltext: string;
  kind: string;
  city: string;
  zipcode: string;
};

type RawGeocodeResponse = {
  results?: RawGeocodeResult[];
};

// https://data.geopf.fr/geocodage/completion/openapi does not provide all the necessary information yet

export class GeocodeClient {
  constructor(
    private rateLimiter: RateLimiter,
    private fetcher: JsonFetcher<RawGeocodeResponse> = fetchJSONGet,
  ) {}

  /**
   * Get coordinates for a given location
   *
   * @see https://geoservices.ign.fr/documentation/services/services-geoplateforme/autocompletion
   */
  async geocode(text: string, maximumResponses = 3): Promise<GeocodeResult[]> {
    const normalizedText = text.trim();

    if (!normalizedText) {
      return [];
    }

    await this.rateLimiter.limit();
    logger.debug(`[gpf:geocode] geocode(${JSON.stringify(normalizedText)}, ${maximumResponses})...`);

    const url = 'https://data.geopf.fr/geocodage/completion/?' + new URLSearchParams({
      text: normalizedText,
      maximumResponses: String(maximumResponses)
    }).toString();

    const json: RawGeocodeResponse = await this.fetcher(url);
    const results = Array.isArray(json?.results) ? json.results : [];
    return results.map((item) => ({
      lon: item.x,
      lat: item.y,
      fulltext: item.fulltext,
      kind: item.kind,
      city: item.city,
      zipcode: item.zipcode
    }));
  }
}

export const geocodeClient = new GeocodeClient(
  new RateLimiter({ name: "GPF_GEOCODE", maxCalls: getEnv().GPF_GEOCODE_RATE_LIMIT, period: 1 }),
);
