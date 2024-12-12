import logger from "../logger.js";

/**
 * 
 * @param {string} url 
 * @returns {Promise<any>}
 */
export async function fetchJSON(url) {
    logger.info(`[HTTP] GET ${url} ...`);
    return fetch(url, {
        headers: new Headers({
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "geocontext"
        })
    }).then(res => res.json());
}
