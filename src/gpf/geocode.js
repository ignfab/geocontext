import logger from "../logger.js";
import { fetchJSON } from "../helpers/http.js";

export const GEOCODE_SOURCE = "Géoplateforme (service d'autocomplétion)";

/**
 * Get coordinates for a given location
 * 
 * @see https://geoservices.ign.fr/documentation/services/services-geoplateforme/autocompletion
 * 
 * @param {string} text 
 * @returns 
 */
export async function geocode(text) {
    logger.info(`geocode(${JSON.stringify(text)})...`);
    
    const url = 'https://data.geopf.fr/geocodage/completion/?' + new URLSearchParams({
      text: text,
      maximumResponses: 3
    }).toString();

    const json = await fetchJSON(url);
    return json.results.map((item)=>{return {
      lon: item.x,
      lat: item.y,
      fulltext: item.fulltext
    }});
}
