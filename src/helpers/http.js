import logger from "../logger.js";

import fetch from 'node-fetch';

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
    return fetch(url, fetchOpts).then(res => res.json());
}
