/**
 * Centralized normalization for MCP tool errors.
 *
 * This helper converts heterogeneous runtime errors (Zod validation errors,
 * upstream service errors, and generic exceptions) into one stable problem
 * payload.
 *
 * Error responses carry no `structuredContent` (reserved for the success-path
 * `outputSchema`), so `detail` is the only channel the caller sees: it must
 * name the offending parameter and stay self-sufficient. The other fields are
 * logged.
 */

import { z, ZodError } from "zod";
import { fr } from "zod/locales";

import { ServiceResponseError } from "../helpers/http.js";
import {
  ProxyTokenMalformedError,
  ProxyTokenTamperedError,
  ProxyTokenTooLargeError,
} from "../proxy/token.js";
import { FeatureNotFoundError, FeatureCardinalityError } from "../wfs/byId.js";

// French Zod messages for every parse of the process, installed at module load so
// the very first parse is already localized. A missing parameter reads better than
// the locale's "indéfini reçu". Messages set in schemas still take precedence.
// The SDK validates the protocol messages with this same zod instance: its JSON-RPC
// errors (e.g. a `tools/call` without `name`) get these French messages too.
z.config({
  ...fr(),
  customError: (issue) => (issue.input === undefined ? "Paramètre requis." : undefined),
});

// --- Public Contract ---

type ToolErrorItem = {
  code: string;
  detail: string;
  name?: string;
};

type ToolUpstreamInfo = {
  status: number;
};

export type ToolErrorPayload = {
  type: string;
  title: string;
  detail: string;
  errors: ToolErrorItem[];
  upstream?: ToolUpstreamInfo;
};

/**
 * Validation messages spelled out in full before the summary elides them.
 *
 * Five keeps the common "whole call is malformed" case fully detailed while
 * bounding the summary to a length a caller can still read at a glance.
 */
const MAX_DETAILED_VALIDATION_ERRORS = 5;

// --- Helpers ---

/**
 * Builds a single-error problem payload.
 *
 * @param type Suffix of the stable RFC7807-like problem type, logged as `problem_type`.
 * @param title Problem title.
 * @param detail Caller-facing message, also the detail of the single `errors[]` item.
 * @param code Machine-friendly error code, `type` in snake_case by default.
 * @returns The problem payload.
 */
function problem(type: string, title: string, detail: string, code = type.replaceAll("-", "_")): ToolErrorPayload {
  return { type: `urn:geocontext:problem:${type}`, title, detail, errors: [{ code, detail }] };
}

/**
 * Maps a Zod error to the invalid parameters problem.
 *
 * Elided messages still list their parameter names, so the caller can fix
 * every bad input in one round-trip instead of discovering them one at a time.
 *
 * @param error Zod error, its messages localized by the `z.config` above.
 * @returns The invalid parameters problem payload.
 */
function buildValidationProblem(error: ZodError): ToolErrorPayload {
  const seen = new Set<string>();
  const errors = error.issues
    .flatMap((issue): ToolErrorItem[] => {
      if (issue.code === "unrecognized_keys") {
        // Prefixed with the path of its object: `departure.alt`, `where[0].foo`.
        const prefix = issue.path.length > 0 ? `${z.core.toDotPath(issue.path)}.` : "";
        return issue.keys.map((key) => ({
          code: "unknown_parameter",
          detail: `Le paramètre '${prefix}${key}' n'est pas reconnu.`,
          name: `${prefix}${key}`,
        }));
      }
      // `bbox.lon`, `tags[1]`, or `[0]` for a root-level array. Empty for a
      // root-level issue.
      const name = z.core.toDotPath(issue.path);
      return name
        ? [{ code: issue.code, detail: `${name}: ${issue.message}`, name }]
        : [{ code: issue.code, detail: issue.message }];
    })
    // A refinement can raise the same wording twice; repeating it only adds noise.
    // `detail` carries the name, so per-element array errors stay separate.
    .filter((item) => !seen.has(item.detail) && seen.add(item.detail));

  const shown = errors.slice(0, MAX_DETAILED_VALIDATION_ERRORS);
  const omitted = errors.slice(MAX_DETAILED_VALIDATION_ERRORS);
  const omittedNames = [...new Set(omitted.flatMap((item) => item.name ?? []))];
  const suffix = omitted.length === 0
    ? ""
    : omittedNames.length > 0
      ? ` (et ${omitted.length} autre(s) erreur(s) sur : ${omittedNames.join(", ")}).`
      : ` (et ${omitted.length} autre(s) erreur(s)).`;

  // The Zod locale messages end without a period: add one so that the joined messages stay readable.
  const detail = `Paramètres invalides : ${shown.map((item) => item.detail.replace(/[^.!?]$/, "$&.")).join(" ")}${suffix}`;
  return { ...problem("invalid-tool-params", "Paramètres d’outil invalides", detail), errors };
}

/**
 * Maps a `ServiceResponseError` to the upstream problem.
 *
 * @param error Structured upstream service error.
 * @returns The upstream problem payload.
 */
function buildUpstreamProblem(error: ServiceResponseError): ToolErrorPayload {
  const status = error.httpStatus;
  const serviceDetail = error.serviceDetail ?? error.message;
  // snake_case: `InvalidParameterValue` -> `invalid_parameter_value`.
  const serviceCode = error.serviceCode?.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[\s-]+/g, "_").toLowerCase();
  const code = /Illegal property name:/i.test(serviceDetail)
    ? "invalid_property_name"
    : serviceCode || "upstream_error";
  const isInvalidRequest = status !== undefined && status >= 400 && status < 500;

  return {
    ...(isInvalidRequest
      ? problem("upstream-invalid-request", "Requête rejetée par le service amont", serviceDetail, code)
      : problem("upstream-error", "Erreur du service amont", serviceDetail, code)),
    detail: `Le service distant a rejeté la requête : ${serviceDetail}`,
    ...(status !== undefined ? { upstream: { status } } : {}),
  };
}

// --- Public API ---

/**
 * Normalizes any runtime error into the shared MCP tool problem contract.
 *
 * The by-id cardinality errors already carry FR, caller-safe messages. The proxy
 * token codec has EN messages: the FR wording lives here, at the tool boundary.
 *
 * @param error Unknown runtime error to normalize.
 * @returns A stable problem payload whose `detail` is caller-facing.
 */
export function normalizeToolError(error: unknown): ToolErrorPayload {
  if (error instanceof ZodError) {
    return buildValidationProblem(error);
  }
  if (error instanceof ServiceResponseError) {
    return buildUpstreamProblem(error);
  }
  if (error instanceof ProxyTokenTooLargeError) {
    return problem(
      "proxy-url-error",
      "Erreur de génération de l’URL de couche",
      "La requête est trop volumineuse pour être encodée dans une URL de couche. Réduire le filtre `where` ou le nombre de propriétés `select`.",
      "proxy_url_too_large",
    );
  }
  if (error instanceof ProxyTokenMalformedError || error instanceof ProxyTokenTamperedError) {
    return problem(
      "proxy-url-error",
      "Erreur de génération de l’URL de couche",
      "Impossible de produire l'URL de couche cartographique.",
    );
  }
  if (error instanceof FeatureNotFoundError) {
    return problem("feature-not-found", "Objet introuvable", error.message.trim());
  }
  if (error instanceof FeatureCardinalityError) {
    return problem("feature-cardinality", "Réponse incohérente du service amont", error.message.trim());
  }

  const message = error instanceof Error ? error.message.trim() : typeof error === "string" ? error.trim() : "";
  return problem("execution-error", "Erreur d’exécution de l’outil", message || "Erreur interne inattendue.");
}
