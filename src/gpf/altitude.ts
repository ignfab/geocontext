import { fetchJSONGet } from "../helpers/http.js";
import logger from "../logger.js";
import type { JsonFetcher } from "../helpers/http.js";
import { RateLimiter } from "../helpers/RateLimiter.js";
import { getEnv } from "../config/env.js";

export const ALTITUDE_SOURCE = "Géoplateforme (altimétrie)";

type RawElevation = {
  lon: number;
  lat: number;
  z: number;
  acc: string;
};

type RawAltitudeResponse = {
  elevations?: RawElevation[];
};

export type AltitudeResult = {
  lon: number;
  lat: number;
  altitude: number;
  accuracy: string;
};

export class AltitudeClient {
  constructor(
    private rateLimiter: RateLimiter,
    private fetcher: JsonFetcher<RawAltitudeResponse> = fetchJSONGet,
  ) {}

  /**
   * Get altitude for a given location.
   *
   * @see https://geoservices.ign.fr/documentation/services/services-deprecies/calcul-altimetrique-rest#1872
   */
  async getByLocation(lon: number, lat: number): Promise<AltitudeResult> {
    await this.rateLimiter.limit();
    logger.debug(`[gpf:altitude] getByLocation(${lon},${lat})...`);

    const url = `https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=${lon}&lat=${lat}&resource=ign_rge_alti_wld`;

    const json: RawAltitudeResponse = await this.fetcher(url);
    const elevation = json.elevations?.[0];

    if (!elevation) {
        throw new Error("Le service d'altitude n'a renvoyé aucune donnée d'altitude");
    }

    return {
        lon: lon,
        lat: lat,
        altitude: elevation.z,
        accuracy: elevation.acc,
    };
  }
}

export const altitudeClient = new AltitudeClient(
  new RateLimiter({ name: "GPF_ALTI", maxCalls: getEnv().GPF_ALTI_RATE_LIMIT, period: 1 }),
);
