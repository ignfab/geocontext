/**
 * Centralized normalization for MCP tool errors.
 *
 * This helper converts heterogeneous runtime errors (Zod validation errors,
 * upstream service errors, and generic exceptions) into one stable
 * `structuredContent` contract consumed by tools through `BaseTool`.
 */

import { ZodError } from "zod";

import { ServiceResponseError } from "../http.js";
import { installZodErrorMapFr } from "./zodErrorMapFr.js";

// Install the FR Zod error map at module load so the very first parse in the
// process already emits localized messages.
installZodErrorMapFr();

// --- Public Contract ---

type ToolErrorItem = {
  code: string;
  detail: string;
  name?: string;
};

type ToolUpstreamInfo = {
  status?: number;
};

export type ToolErrorPayload = {
  type: string;
  title: string;
  detail: string;
  errors: ToolErrorItem[];
  upstream?: ToolUpstreamInfo;
};

type ClassifiedToolError =
  | { kind: "invalid_tool_params"; error: ZodError }
  | { kind: "upstream"; error: ServiceResponseError }
  | { kind: "execution"; error: unknown };

// --- Problem Type Constants ---

/**
 * Stable RFC7807-like problem type identifiers exposed in `structuredContent`.
 */
const INVALID_TOOL_PARAMS_TYPE = "urn:geocontext:problem:invalid-tool-params";
const UPSTREAM_INVALID_REQUEST_TYPE = "urn:geocontext:problem:upstream-invalid-request";
const UPSTREAM_ERROR_TYPE = "urn:geocontext:problem:upstream-error";
const EXECUTION_ERROR_TYPE = "urn:geocontext:problem:execution-error";

// --- Shared Helpers ---

/**
 * Returns the most specific string segment from a Zod issue path.
 * 
 * TODO: this is a best-effort heuristic to extract a user-friendly parameter name
 *
 * @param path Zod issue path.
 * @returns Last non-empty string segment, or `undefined`.
 */
function issueName(path: Array<string | number>) {
  for (let index = path.length - 1; index >= 0; index -= 1) {
    const segment = path[index];
    if (typeof segment === "string" && segment.length > 0) {
      return segment;
    }
  }
  return undefined;
}

/**
 * Builds a compact end-user summary from normalized validation errors.
 *
 * @param errors Normalized validation errors.
 * @returns A short, localized validation summary.
 */
function summarizeValidationDetail(errors: ToolErrorItem[]) {
  if (errors.length === 0) {
    return "Un ou plusieurs paramètres fournis à l'outil sont invalides.";
  }

  const details = errors.map((error) => error.detail);
  const firstDetails = details.slice(0, 3).join(" ");
  const suffix = details.length > 3 ? " (et d'autres erreurs)." : "";
  return `Paramètres invalides : ${firstDetails}${suffix}`;
}

/**
 * Converts service error codes to a snake_case machine-friendly form.
 *
 * @param value Error code to normalize.
 * @returns A normalized snake_case code.
 */
function toSnakeCase(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s\-]+/g, "_")
    .toLowerCase();
}

// --- Zod Error Mapping ---

/**
 * Converts Zod issues to normalized `errors[]` entries.
 *
 * Note: issue messages are expected to already be localized through
 * `zodErrorMapFr` (installed once at module load).
 */
function normalizeZodIssues(error: ZodError): ToolErrorItem[] {
  const errors: ToolErrorItem[] = [];

  for (const issue of error.issues) {
    if (issue.code === "unrecognized_keys") {
      const keys = issue.keys.length > 0 ? issue.keys : ["<inconnu>"];
      for (const key of keys) {
        errors.push({
          code: "unknown_parameter",
          detail: `Le paramètre '${key}' n'est pas reconnu.`,
          name: key,
        });
      }
      continue;
    }

    const name = issueName(issue.path);
    errors.push({
      code: issue.code,
      detail: issue.message || "Valeur invalide.",
      ...(name ? { name } : {}),
    });
  }

  return errors;
}

// --- Upstream Error Mapping ---

/**
 * Maps a `ServiceResponseError` to the shared upstream problem payload.
 *
 * @param error Structured upstream service error.
 * @returns A normalized upstream problem payload.
 */
function buildUpstreamProblem(error: ServiceResponseError): ToolErrorPayload {
  const status = typeof error.httpStatus === "number" ? error.httpStatus : undefined;

  const serviceDetail = error.serviceDetail ?? error.message ?? "Erreur amont inconnue.";
  const inferredErrorCode = /Illegal property name:/i.test(serviceDetail)
    ? "invalid_property_name"
    : error.serviceCode
      ? toSnakeCase(error.serviceCode)
      : "upstream_error";
  const isInvalidRequest = status !== undefined && status >= 400 && status < 500;

  return {
    type: isInvalidRequest ? UPSTREAM_INVALID_REQUEST_TYPE : UPSTREAM_ERROR_TYPE,
    title: isInvalidRequest
      ? "Requête rejetée par le service amont"
      : "Erreur du service amont",
    detail: `Le service distant a rejeté la requête : ${serviceDetail}`,
    errors: [
      {
        code: inferredErrorCode,
        detail: serviceDetail,
      },
    ],
    ...(status !== undefined ? { upstream: { status } } : {}),
  };
}

/**
 * Maps unknown runtime errors to one of the normalization categories.
 *
 * @param error Unknown runtime error.
 * @returns Classified error with a normalized kind and a narrowed payload.
 */
function classifyToolError(error: unknown): ClassifiedToolError {
  if (error instanceof ZodError) {
    return { kind: "invalid_tool_params", error };
  }
  if (error instanceof ServiceResponseError) {
    return { kind: "upstream", error };
  }
  return { kind: "execution", error };
}

/**
 * Maps generic runtime errors to the shared execution problem payload.
 *
 * @param error Unknown runtime error.
 * @returns A normalized execution problem payload.
 */
function buildExecutionProblem(error: unknown): ToolErrorPayload {
  const message = error instanceof Error
    ? error.message.trim()
    : typeof error === "string"
      ? error.trim()
      : "";
  const detail = message.length > 0 ? message : "Erreur interne inattendue.";

  return {
    type: EXECUTION_ERROR_TYPE,
    title: "Erreur d’exécution de l’outil",
    detail,
    errors: [
      {
        code: "execution_error",
        detail,
      },
    ],
  };
}

// --- Public API ---

/**
 * Normalizes any runtime error into the shared MCP tool problem contract.
 *
 * @param error Unknown runtime error to normalize.
 * @returns A stable payload intended for MCP `structuredContent`.
 */
export function normalizeToolError(error: unknown): ToolErrorPayload {
  const classifiedError = classifyToolError(error);

  switch (classifiedError.kind) {
    case "invalid_tool_params": {
      const errors = normalizeZodIssues(classifiedError.error);
      return {
        type: INVALID_TOOL_PARAMS_TYPE,
        title: "Paramètres d’outil invalides",
        detail: summarizeValidationDetail(errors),
        errors,
      };
    }
    case "upstream":
      return buildUpstreamProblem(classifiedError.error);
    case "execution":
      return buildExecutionProblem(classifiedError.error);
  }
}
