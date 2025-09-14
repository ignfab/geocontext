import logger from "../logger.js";
import { fetchJSON } from "../helpers/http.js";

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
      text: text
    }).toString();

    const json = await fetchJSON(url);
    return json.results;
}
