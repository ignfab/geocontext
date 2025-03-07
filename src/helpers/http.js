import fetch from 'node-fetch';

import logger from "../logger.js";

import { HttpsProxyAgent } from 'https-proxy-agent';

const fetchOpts = {
    headers: new Headers({
        "Accept": "application/json",
        "User-Agent": "geocontext"
    })
};

if ( process.env.HTTP_PROXY ){
    fetchOpts.agent = new HttpsProxyAgent(process.env.HTTP_PROXY); 
}

/**
 * 
 * @param {string} url 
 * @returns {Promise<any>}
 */
export async function fetchJSON(url) {
    logger.info(`[HTTP] GET ${url} ...`);
    const result = await fetch(url, fetchOpts).then(res => res.json());
    logger.debug(`[HTTP] GET ${url} : ${JSON.stringify(result)}`)
    return result;
}
