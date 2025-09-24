import logger from "../logger.js";
import { fetchJSON } from "../helpers/http.js";

export const ALTITUDE_SOURCE = "Géoplateforme (altimétrie)";

/**
 * Get altitude for a given location.
 * 
 * @see https://geoservices.ign.fr/documentation/services/services-deprecies/calcul-altimetrique-rest#1872
 * 
 * @param {number} lon 
 * @param {number} lat 
 * @returns 
 */
export async function getAltitudeByLocation(lon, lat) {
    logger.info(`getAltitudeByLocation(${lon},${lat})...`);
    
    const url = `https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=${lon}&lat=${lat}&resource=ign_rge_alti_wld`;
    try {
        const json = await fetchJSON(url);
        const elevation = json.elevations[0] ;
        return {
            lon: lon,
            lat: lat,
            altitude: elevation.z,
            accuracy: elevation.acc,
        };
    }catch(e){
        return {
            lon: lon,
            lat: lat,
            altitude: null,
            accuracy: 'No data',
        };
    }


}
