import fetch from 'node-fetch';
import type { RequestInit } from "node-fetch";

import { parseXml, XmlElement } from '@rgrove/parse-xml';

import logger from "../logger.js";

import { HttpsProxyAgent } from 'https-proxy-agent';

type HeadersLike = {
  get(name: string): string | null;
};

type ResponseLike = {
  status: number;
  statusText: string;
  ok?: boolean;
  headers?: HeadersLike;
  text(): Promise<string>;
};

type RequestHeaders = Record<string, string>;

const defaultHeaders = new Headers({
  Accept: "application/json",
  "User-Agent": "geocontext",
});


const fetchOpts:RequestInit = {
    headers: defaultHeaders,
};

if ( process.env.HTTP_PROXY ){
    fetchOpts.agent = new HttpsProxyAgent(process.env.HTTP_PROXY); 
}

function getChild(element: XmlElement | null | undefined, localName: string): XmlElement | null {
    if (!element) {
        return null;
    }

    const child = element.children.find(
    (candidate): candidate is XmlElement =>
        candidate instanceof XmlElement &&
        candidate.name.split(":").pop() === localName
    );

    return child ?? null;
}

// Tente d'extraire un message d'erreur d'une réponse XML de type OGC WFS
function extractXmlError(text: string): Error | null {
    try {
        const root = parseXml(text).children.find((child) => child instanceof XmlElement);
        const rootName = root?.name.split(":").pop();
        if (rootName !== "ExceptionReport" && rootName !== "ServiceExceptionReport") {
            return null;
        }

        const exception = getChild(root, "Exception") || getChild(root, "ServiceException");
        if (!exception) {
            return null;
        }

        const code = exception.attributes?.exceptionCode || exception.attributes?.code;
        const message = getChild(exception, "ExceptionText")?.text?.trim() || exception.text?.trim() || "";
        const errorMessage = [code, message].filter(Boolean).join(": ");
        return errorMessage ? new Error(errorMessage) : null;
    } catch {
        return null;
    }
}

function previewBody(text: string): string {
    const trimmed = text.trim();
    if (!trimmed) {
        return "";
    }

    return trimmed.replace(/\s+/g, " ").slice(0, 200);
}

export async function parseJsonResponse(res: ResponseLike): Promise<any> {
    const contentType = (res.headers?.get?.("content-type") || "").toLowerCase();
    const text = await res.text();
    const looksLikeXml = contentType.includes("xml") || text.trim().startsWith("<");
    const responseLabel = [res.status, res.statusText].filter(Boolean).join(" ") || "réponse HTTP";
    const hasValidStatus = Number.isFinite(res.status);
    const isOk = typeof res.ok === "boolean"
        ? res.ok
        : hasValidStatus && res.status >= 200 && res.status < 300;

    if (text.trim() === "") {
        throw new Error(`Réponse vide du service (${responseLabel})`);
    }

    if (looksLikeXml) {
        const xmlError = extractXmlError(text);

        if (xmlError) {
            if (!isOk) {
                throw new Error(`Erreur HTTP du service (${responseLabel}): ${xmlError.message}`);
            }
            throw xmlError;
        }

        const details = [`content-type=${contentType || "inconnu"}`];
        const bodyPreview = previewBody(text);
        if (bodyPreview) {
            details.push(`extrait=${bodyPreview}`);
        }

        throw new Error(`Réponse XML non exploitable du service (${responseLabel}, ${details.join(", ")})`);
    }

    let json;
    try {
        json = JSON.parse(text);
    } catch {
        const details = [`content-type=${contentType || "inconnu"}`];
        const bodyPreview = previewBody(text);
        if (bodyPreview) {
            details.push(`extrait=${bodyPreview}`);
        }

        throw new Error(`Réponse JSON invalide du service (${responseLabel}, ${details.join(", ")})`);
    }

    if (!isOk) {
        const errorMessage = json?.message
            || json?.error
            || json?.errorMessage
            || json?.msg
            || json?.title
            || json?.detail
            || (typeof json === "string" ? json : previewBody(JSON.stringify(json)));
        throw new Error(`Erreur HTTP du service (${responseLabel}): ${errorMessage}`);
    }

    return json;
}

/**
 * Fetches and parses a JSON response from a URL
 * TODO : Add a timeout
 * 
 * @param {string} url 
 * @returns {Promise<any>}
 */
export async function fetchJSON(url: string): Promise<any> {
    logger.info(`[HTTP] GET ${url} ...`);
    const result = await fetch(url, fetchOpts).then(parseJsonResponse);
    logger.debug(`[HTTP] GET ${url} : ${JSON.stringify(result)}`)
    return result;
}

function buildFetchOptions(method: string, body: string | undefined, headers: RequestHeaders = {}) {
    return {
        ...fetchOpts,
        method,
        headers: new Headers({
            ...Object.fromEntries(defaultHeaders.entries()),
            ...(headers || {})
        }),
        ...(body !== undefined ? { body } : {})
    };
}

export async function fetchJSONPost(url: string, body: string = "", headers: RequestHeaders = {}) {
    logger.info(`[HTTP] POST ${url} ...`);
    const result = await fetch(url, buildFetchOptions("POST", body, headers)).then(parseJsonResponse);
    logger.debug(`[HTTP] POST ${url} : ${JSON.stringify(result)}`);
    return result;
}
