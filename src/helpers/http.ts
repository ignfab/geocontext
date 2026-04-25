/**
 * Shared HTTP transport and response parsing helpers used across GeoContext services.
 *
 * Responsibilities:
 * - centralize GET/POST fetch wrappers (`fetchJSONGet`, `fetchJSONPost`);
 * - normalize HTTP, XML and JSON upstream failures as `ServiceResponseError`;
 * - extract known structured error payloads (OGC/WFS XML, GeoServer/altimetry/autocompletion JSON);
 * - keep parser diagnostics explicit for malformed or unsupported payloads.
 *
 * Organization:
 * - this file is intentionally ordered by runtime call flow (top-down),
 *   from public entry points to lower-level parsing/scalar helpers.
 */


import fetch from "node-fetch";
import type { RequestInit } from "node-fetch";
import { HttpsProxyAgent } from "https-proxy-agent";
import { parseXml, XmlElement } from "@rgrove/parse-xml";

import logger from "../logger.js";


// --- Transport Types ---

type RequestHeaders = Record<string, string>;

type ResponseHeadersLike = {
  get(name: string): string | null;
};

type ResponseLike = {
  status: number;
  statusText: string;
  ok: boolean;
  headers: ResponseHeadersLike;
  text(): Promise<string>;
};

export type JsonFetcher<T> = (url: string) => Promise<T>;

// --- Parsing Types ---

type ResponseParsingContext = {
  text: string;
  contentType: string;
  looksLikeXml: boolean;
  responseLabel: string;
  isOk: boolean;
  status: number;
};

type ServiceResponseErrorOptions = {
  http: {
    status: number;
    statusText?: string;
  };
  service?: {
    code?: string;
    detail?: string;
  };
};

type XmlServiceError = {
  code?: string;
  detail?: string;
  message: string;
};

type JsonServiceError = {
  code?: string;
  detail: string;
};

// --- Shared Fetch State ---

const defaultHeaders = new Headers({
  Accept: "application/json",
  "User-Agent": "geocontext",
});

const fetchOpts: RequestInit = {
  headers: defaultHeaders,
};

// Reuse the standard proxy environment variable so every shared HTTP helper
// transparently follows the same outbound network path when a proxy is required.
if (process.env.HTTP_PROXY) {
  fetchOpts.agent = new HttpsProxyAgent(process.env.HTTP_PROXY);
}

// --- Service Errors ---

/**
 * Structured service error enriched with HTTP and upstream service metadata.
 */
export class ServiceResponseError extends Error {
  httpStatus?: number;
  httpStatusText?: string;
  serviceCode?: string;
  serviceDetail?: string;

  constructor(message: string, options: ServiceResponseErrorOptions) {
    super(message);
    this.name = "ServiceResponseError";
    this.httpStatus = options.http.status;
    this.httpStatusText = options.http.statusText;
    this.serviceCode = options.service?.code;
    this.serviceDetail = options.service?.detail;
  }
}

// --- Constants ---

const UNKNOWN_UPSTREAM_DETAIL = "Erreur amont inconnue.";
const JSON_EXCEPTION_CODE_FIELDS = ["code", "exceptionCode"] as const;
const JSON_EXCEPTION_DETAIL_FIELDS = ["text", "message", "detail"] as const;
const JSON_NESTED_ERROR_DETAIL_FIELDS = ["description", "message", "detail"] as const;
const JSON_ROOT_DETAIL_FIELDS = ["message", "detail"] as const;

// --- Transport Functions ---

/**
 * Sends a GET request expected to return JSON and parses the response.
 *
 * @param url Target URL.
 * @returns The parsed JSON payload.
 */
export async function fetchJSONGet(url: string): Promise<any> {
  logger.info(`[HTTP] GET ${url} ...`);
  const result = await fetch(url, fetchOpts).then(parseJsonResponse);
  logger.debug(`[HTTP] GET ${url} : ${JSON.stringify(result)}`);
  return result;
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

/**
 * Builds the fetch options used by the shared fetchJSONPost helper.
 * Inherits shared transport settings from `fetchOpts` (including proxy agent),
 * merges `defaultHeaders` with caller-provided headers, and only adds `body`
 * when it is explicitly provided.
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

// --- Response Parsing ---

/**
 * Parses an HTTP response expected to contain JSON and upgrades recognizable
 * XML/JSON service errors to richer structured exceptions.
 *
 * @param res HTTP-like response object returned by `fetch`.
 * @returns The parsed JSON payload.
 */
export async function parseJsonResponse(res: ResponseLike): Promise<any> {
  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  const text = await res.text();
  const context = buildResponseContext(res, text, contentType);

  if (context.text.trim() === "") {
    throw new Error(`Réponse vide du service (${context.responseLabel})`);
  }

  // handleXmlResponse always throws, either with a structured service error or an explicit parsing error.
  if (context.looksLikeXml) {
    handleXmlResponse(context);
  }

  const json = parseJsonBody(context);

  // If the response is not OK, try to extract structured error details from the JSON body 
  // and throw a ServiceResponseError with as much context as possible.
  if (!context.isOk) {
    const serviceError = extractJsonServiceError(json);
    throw buildServiceResponseError(
      context,
      `Erreur HTTP du service (${context.responseLabel}): ${serviceError.detail}`,
      {
        code: serviceError.code,
        detail: serviceError.detail,
      },
    );
  }

  return json;
}

/**
 * Parses a JSON payload or throws a stable parsing error.
 *
 * @param context Normalized response context.
 * @returns Parsed JSON payload.
 */
function parseJsonBody(context: ResponseParsingContext): unknown {
  try {
    return JSON.parse(context.text);
  } catch {
    const details = buildBodyDetails(context.contentType, context.text);
    throw new Error(`Réponse JSON invalide du service (${context.responseLabel}, ${details.join(", ")})`);
  }
}

// --- XML Error Extraction ---

/**
 * Handles XML-like responses and either throws structured upstream errors
 * or explicit parsing diagnostics.
 *
 * @param context Normalized response context.
 * @throws {ServiceResponseError | Error} Always throws for XML-like responses.
 */
function handleXmlResponse(context: ResponseParsingContext): never {
  const xmlError = extractXmlServiceError(context.text);
  if (xmlError) {
    if (!context.isOk) {
      throw buildServiceResponseError(
        context,
        `Erreur HTTP du service (${context.responseLabel}): ${xmlError.message}`,
        {
          code: xmlError.code,
          detail: xmlError.detail,
        },
      );
    }

    throw buildServiceResponseError(context, xmlError.message, {
      code: xmlError.code,
      detail: xmlError.detail,
    });
  }

  const unstructuredDetail = previewBody(context.text) || UNKNOWN_UPSTREAM_DETAIL;
  if (!context.isOk) {
    throw buildServiceResponseError(
      context,
      `Erreur HTTP du service (${context.responseLabel}): ${unstructuredDetail}`,
      { detail: unstructuredDetail },
    );
  }

  const details = buildBodyDetails(context.contentType, context.text);
  throw new Error(`Réponse XML non exploitable du service (${context.responseLabel}, ${details.join(", ")})`);
}

/**
 * Tries to extract an OGC/WFS-style service error from an XML response body.
 *
 * @param text Raw XML response body.
 * @returns A parsed service error payload, or `null` when the XML payload is not a recognized error report.
 */
function extractXmlServiceError(text: string): XmlServiceError | null {
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
      ? {
        code,
        detail: message || undefined,
        message: errorMessage,
      }
      : null;
  } catch {
    return null;
  }
}

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
      candidate.name.split(":").pop() === localName,
  );

  return child ?? null;
}

// --- JSON Error Extraction ---

/**
 * Extracts structured upstream error details from a parsed JSON error body.
 *
 * @param json Parsed JSON payload.
 * @returns A normalized `{ code, detail }` pair.
 */
function extractJsonServiceError(json: unknown): JsonServiceError {
  if (typeof json === "string") {
    return { detail: asNonEmptyString(json) ?? UNKNOWN_UPSTREAM_DETAIL };
  }

  const rootRecord = asRecord(json) ?? {};
  const nestedError = asRecord(rootRecord.error);
  const firstException = firstRecordItem(rootRecord.exceptions);
  const rootDetailItem = firstStringItem(rootRecord.detail);
  const nestedErrorDetailItem = firstStringItem(nestedError?.detail);
  const rootCode = asErrorCode(rootRecord.code);
  const nestedErrorCode = asErrorCode(nestedError?.code);

  const code = pickFirstString([
    pickFirstStringField(firstException, JSON_EXCEPTION_CODE_FIELDS),
    rootCode,
    nestedErrorCode,
  ]);

  const detail = pickFirstString([
    pickFirstStringField(firstException, JSON_EXCEPTION_DETAIL_FIELDS),
    pickFirstStringField(nestedError, JSON_NESTED_ERROR_DETAIL_FIELDS),
    nestedErrorDetailItem,
    rootDetailItem,
    pickFirstStringField(rootRecord, JSON_ROOT_DETAIL_FIELDS),
    typeof rootRecord.error === "string" ? rootRecord.error : undefined,
  ]) || previewBody(JSON.stringify(json)) || UNKNOWN_UPSTREAM_DETAIL;

  return { code, detail };
}

// --- Context Builders ---

/**
 * Builds a normalized response context consumed by parsing helpers.
 *
 * @param res HTTP-like response object.
 * @param text Raw response body.
 * @param contentType Normalized content-type header.
 * @returns Structured context used by XML/JSON parsers.
 */
function buildResponseContext(
  res: ResponseLike,
  text: string,
  contentType: string,
): ResponseParsingContext {
  return {
    text,
    contentType,
    looksLikeXml: isLikelyXml(contentType, text),
    responseLabel: buildResponseLabel(res.status, res.statusText),
    isOk: res.ok,
    status: res.status,
  };
}

/**
 * Checks whether a response likely contains XML data.
 *
 * TODO: Use a less stupid heuristic. Ok for a proof of concept but should be improved for production use.
 *
 * @param contentType Normalized content-type header.
 * @param text Raw response body.
 * @returns `true` when XML parsing should be attempted.
 */
function isLikelyXml(contentType: string, text: string) {
  return contentType.includes("xml") || text.trim().startsWith("<");
}

/**
 * Builds a structured service response error tied to the current HTTP context.
 *
 * @param context Normalized response context.
 * @param message Error message.
 * @param service Optional upstream service metadata.
 * @returns A normalized `ServiceResponseError`.
 */
function buildServiceResponseError(
  context: ResponseParsingContext,
  message: string,
  service?: { code?: string; detail?: string },
) {
  return new ServiceResponseError(message, {
    http: {
      status: context.status,
      statusText: context.responseLabel,
    },
    ...(service ? { service } : {}),
  });
}

/**
 * Builds reusable diagnostic details for parser errors.
 *
 * @param contentType Normalized content-type header.
 * @param text Raw response body.
 * @returns A detail string list used in human-readable error messages.
 */
function buildBodyDetails(contentType: string, text: string) {
  const details = [`content-type=${contentType || "inconnu"}`];
  const bodyPreview = previewBody(text);
  if (bodyPreview) {
    details.push(`extrait=${bodyPreview}`);
  }
  return details;
}

/**
 * Builds a human-readable response label combining HTTP status and text.
 *
 * @param status HTTP status code.
 * @param statusText HTTP status text.
 * @returns A label such as `400 Bad Request`.
 */
function buildResponseLabel(status: number, statusText: string) {
  return [status, statusText].filter(Boolean).join(" ") || "réponse HTTP";
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

// --- Scalar Helpers ---

/**
 * Converts an unknown scalar code to a normalized string.
 *
 * @param value Unknown code value.
 * @returns A non-empty string representation, or `undefined`.
 */
function asErrorCode(value: unknown): string | undefined {
  if (typeof value === "string") {
    return asNonEmptyString(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

/**
 * Returns the first non-empty string from an array-like unknown value.
 *
 * @param value Unknown value to inspect.
 * @returns The first non-empty string item, or `undefined`.
 */
function firstStringItem(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return pickFirstString(value);
}

/**
 * Returns the first non-empty string for a record among ordered field names.
 *
 * @param record Object-like value to inspect.
 * @param fields Ordered field names.
 * @returns The first non-empty string value, or `undefined`.
 */
function pickFirstStringField(
  record: Record<string, unknown> | undefined,
  fields: readonly string[],
): string | undefined {
  if (!record) {
    return undefined;
  }

  return pickFirstString(fields.map((field) => record[field]));
}

/**
 * Returns the first non-empty string in the provided values.
 *
 * @param values Candidate values ordered by priority.
 * @returns The first normalized non-empty string, or `undefined`.
 */
function pickFirstString(values: unknown[]): string | undefined {
  for (const value of values) {
    const normalized = asNonEmptyString(value);
    if (normalized) {
      return normalized;
    }
  }
  return undefined;
}

/**
 * Returns the first object item from an unknown array value.
 *
 * @param value Unknown value to inspect.
 * @returns First object item as a record, or `undefined`.
 */
function firstRecordItem(value: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  for (const item of value) {
    const record = asRecord(item);
    if (record) {
      return record;
    }
  }

  return undefined;
}

/**
 * Returns a plain record when the provided value is an object.
 *
 * @param value Unknown value to inspect.
 * @returns A record view of the object, or `undefined`.
 */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  return value as Record<string, unknown>;
}

/**
 * Returns a trimmed string when the provided value is a non-empty string.
 *
 * @param value Unknown value to inspect.
 * @returns A normalized string or `undefined`.
 */
function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
