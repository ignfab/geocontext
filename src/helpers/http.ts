import fetch from 'node-fetch';
import type { RequestInit } from "node-fetch";
import { HttpsProxyAgent } from 'https-proxy-agent';
import { parseXml, XmlElement } from '@rgrove/parse-xml';

import logger from "../logger.js";

// --- Transport Types ---

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

type ServiceResponseErrorOptions = {
  httpStatus?: number;
  responseLabel?: string;
  serviceCode?: string;
  serviceDetail?: string;
};

// --- Shared Fetch State ---

const defaultHeaders = new Headers({
  Accept: "application/json",
  "User-Agent": "geocontext",
});

const fetchOpts: RequestInit = {
  headers: defaultHeaders,
};

export type JsonFetcher<T> = (url: string) => Promise<T>;

// --- Service Errors ---

/**
 * Structured service error enriched with HTTP and upstream service metadata.
 */
export class ServiceResponseError extends Error {
  httpStatus?: number;
  responseLabel?: string;
  serviceCode?: string;
  serviceDetail?: string;

  constructor(message: string, options: ServiceResponseErrorOptions = {}) {
    super(message);
    this.name = "ServiceResponseError";
    this.httpStatus = options.httpStatus;
    this.responseLabel = options.responseLabel;
    this.serviceCode = options.serviceCode;
    this.serviceDetail = options.serviceDetail;
  }
}

/**
 * Checks whether an unknown error exposes the structured service-error shape.
 *
 * @param error Unknown error value caught by the caller.
 * @returns `true` when the error can be treated as a `ServiceResponseError`.
 */
export function isServiceResponseError(error: unknown): error is ServiceResponseError {
  return error instanceof Error && (
    error instanceof ServiceResponseError
    || error.name === "ServiceResponseError"
    || "serviceCode" in error
    || "serviceDetail" in error
  );
}

// Reuse the standard proxy environment variable so every shared HTTP helper
// transparently follows the same outbound network path when a proxy is required.
if (process.env.HTTP_PROXY) {
  fetchOpts.agent = new HttpsProxyAgent(process.env.HTTP_PROXY);
}

// --- XML Helpers ---

/**
 * Returns the first child XML element matching the requested local name.
 *
 * @param element Parent element to inspect.
 * @param localName Local XML name without namespace prefix.
 * @returns The matching child element, or `null` when none is found.
 */
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

/**
 * Tries to extract an OGC/WFS-style service error from an XML response body.
 *
 * @param text Raw XML response body.
 * @returns A structured service error, or `null` when the XML payload is not a recognized error report.
 */
function extractXmlError(text: string): ServiceResponseError | null {
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

    return errorMessage
      ? new ServiceResponseError(errorMessage, {
        serviceCode: code,
        serviceDetail: message || undefined,
      })
      : null;
  } catch {
    return null;
  }
}

/**
 * Returns a short single-line preview of a response body for diagnostics.
 *
 * @param text Raw response body.
 * @returns A trimmed preview limited to 200 characters.
 */
function previewBody(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.replace(/\s+/g, " ").slice(0, 200);
}

// --- Response Parsing ---

/**
 * Parses an HTTP response expected to contain JSON and upgrades recognizable
 * XML/JSON service errors to richer structured exceptions.
 *
 * @param res HTTP-like response object returned by `fetch`.
 * @returns The parsed JSON payload.
 */
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
        throw new ServiceResponseError(
          `Erreur HTTP du service (${responseLabel}): ${xmlError.message}`,
          {
            httpStatus: hasValidStatus ? res.status : undefined,
            responseLabel,
            serviceCode: xmlError.serviceCode,
            serviceDetail: xmlError.serviceDetail,
          },
        );
      }

      xmlError.httpStatus = hasValidStatus ? res.status : undefined;
      xmlError.responseLabel = responseLabel;
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

    throw new ServiceResponseError(`Erreur HTTP du service (${responseLabel}): ${errorMessage}`, {
      httpStatus: hasValidStatus ? res.status : undefined,
      responseLabel,
      serviceDetail: errorMessage,
    });
  }

  return json;
}

/**
 * Fetches and parses a JSON response from a URL.
 *
 * @param url Target URL.
 * @returns The parsed JSON payload.
 */
export async function fetchJSON(url: string): Promise<any> {
  logger.info(`[HTTP] GET ${url} ...`);
  const result = await fetch(url, fetchOpts).then(parseJsonResponse);
  logger.debug(`[HTTP] GET ${url} : ${JSON.stringify(result)}`);
  return result;
}

/**
 * Builds the fetch options used by the shared JSON helpers.
 *
 * @param method HTTP method to use.
 * @param body Optional request body.
 * @param headers Additional request headers.
 * @returns A `fetch` options object merged with shared defaults.
 */
function buildFetchOptions(method: string, body: string | undefined, headers: RequestHeaders = {}) {
  return {
    ...fetchOpts,
    method,
    headers: new Headers({
      ...Object.fromEntries(defaultHeaders.entries()),
      ...(headers || {}),
    }),
    ...(body !== undefined ? { body } : {}),
  };
}

/**
 * Sends a POST request expected to return JSON and parses the response.
 *
 * @param url Target URL.
 * @param body Optional encoded request body.
 * @param headers Additional request headers.
 * @returns The parsed JSON payload.
 */
export async function fetchJSONPost(url: string, body: string = "", headers: RequestHeaders = {}) {
  logger.info(`[HTTP] POST ${url} ...`);
  const result = await fetch(url, buildFetchOptions("POST", body, headers)).then(parseJsonResponse);
  logger.debug(`[HTTP] POST ${url} : ${JSON.stringify(result)}`);
  return result;
}
