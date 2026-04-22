import { fetchJSON } from "../helpers/http.js";
import logger from "../logger.js";

export const ALTITUDE_SOURCE = "Géoplateforme (altimétrie)";

type JsonFetcher = (url: string) => Promise<any>;

type RawElevation = {
  lon: number;
  lat: number;
  z: number;
  acc: string;
};

type RawAltitudeResponse = {
  elevations?: RawElevation[];
};

type AltitudeResult = {
  lon: number;
  lat: number;
  altitude: number;
  accuracy: string;
};

/**
 * Get altitude for a given location.
 * 
 * @see https://geoservices.ign.fr/documentation/services/services-deprecies/calcul-altimetrique-rest#1872
 * 
 * @param {number} lon 
 * @param {number} lat 
 * @param {(url: string) => Promise<any>} [fetcher]
 * @returns {Promise<AltitudeResult>}
 */
export async function getAltitudeByLocation(lon: number, lat: number, fetcher: JsonFetcher = fetchJSON): Promise<AltitudeResult> {
    logger.info(`getAltitudeByLocation(${lon},${lat})...`);
    
    const url = `https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=${lon}&lat=${lat}&resource=ign_rge_alti_wld`;

    const json: RawAltitudeResponse = await fetcher(url);
    const elevation = json?.elevations?.[0];

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
