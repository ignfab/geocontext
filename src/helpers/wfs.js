import { fetchJSON } from './http.js';

const GPF_WFS_BASE_URL = process.env.GPF_WFS_BASE_URL || 'https://data.geopf.fr/wfs';

/**
 * Fetch features from a GPF WFS endpoint.
 *
 * @param {string[]} typeNames - fully qualified WFS type names
 * @param {string} cqlFilter - CQL_FILTER value
 * @param {string} errorLabel - service label used in the error message
 * @param {(url: string) => Promise<any>} [fetcher]
 * @returns {Promise<any[]>} raw GeoJSON features array
 */
export async function fetchWfsFeatures(typeNames, cqlFilter, errorLabel, fetcher = fetchJSON) {
    const url = GPF_WFS_BASE_URL + '?' + new URLSearchParams({
        service: 'WFS',
        request: 'GetFeature',
        typeName: typeNames.join(','),
        outputFormat: 'application/json',
        cql_filter: cqlFilter,
    }).toString();

    const featureCollection = await fetcher(url);
    if (!Array.isArray(featureCollection?.features)) {
        throw new Error(`Le service ${errorLabel} n'a pas retourné de collection d'objets exploitable`);
    }
    return featureCollection.features;
}
