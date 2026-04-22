import { fetchJSON } from "../helpers/http.js";
import logger from "../logger.js";
import type { JsonFetcher } from "../helpers/http.js";
export const GEOCODE_SOURCE = "Géoplateforme (service d'autocomplétion)";

type RawGeocodeResult = {
  x: number;
  y: number;
  fulltext: string;
  kind: string;
  city: string;
  zipcode: string;
};

type GeocodeResult = {
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

/**
 * Get coordinates for a given location
 * 
 * @see https://geoservices.ign.fr/documentation/services/services-geoplateforme/autocompletion
 * 
 * @param {string} text
 * @param {number} [maximumResponses=3]
 * @param {JsonFetcher<RawGeocodeResponse>} [fetcher] - optional custom fetcher function
 * @returns {Promise<GeocodeResult[]>}
 */
export async function geocode(text: string, maximumResponses = 3, fetcher: JsonFetcher<RawGeocodeResponse> = fetchJSON): Promise<GeocodeResult[]> {
    const normalizedText = typeof text === "string" ? text.trim() : "";

    if (!normalizedText) {
      return [];
    }

    logger.info(`geocode(${JSON.stringify(normalizedText)}, ${maximumResponses})...`);
    
    const url = 'https://data.geopf.fr/geocodage/completion/?' + new URLSearchParams({
      text: normalizedText,
      maximumResponses: String(maximumResponses)
    }).toString();

    const json: RawGeocodeResponse = await fetcher(url);
    const results = Array.isArray(json?.results) ? json.results : [];
    return results.map((item)=>{return {
      lon: item.x,
      lat: item.y,
      fulltext: item.fulltext,
      kind: item.kind,
      city: item.city,
      zipcode: item.zipcode
    }});
}
