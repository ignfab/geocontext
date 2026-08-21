/**
 * French Zod error map used as the global default for tool input validation.
 *
 * TODO: We are doing this because we are forced to use zod 3 for now
 * and zod 3 does not support per-schema error maps. Once we upgrade to zod 4,
 * we should refactor to use per-schema error maps and remove this global map.
 * 
 * Goal:
 * - keep custom schema messages intact
 * - replace default English Zod messages with concise FR equivalents
 */

import { z, type ZodErrorMap } from "zod";

// --- Types ---

type ErrorMapIssue = Parameters<ZodErrorMap>[0];
type IssuePath = ErrorMapIssue["path"];
type TooSmallIssue = Extract<ErrorMapIssue, { code: "too_small" }>;
type TooBigIssue = Extract<ErrorMapIssue, { code: "too_big" }>;

// --- Internal State ---

let isInstalled = false;

// --- Shared Helpers ---

/**
 * Builds a user-friendly parameter name from a Zod issue path.
 *
 * String segments are joined with `.` to keep nested fields unambiguous
 * (`bbox.lon`, not a bare `lon` that two objects could both produce). Array
 * indices are kept as `[i]` so per-element errors stay distinguishable
 * (`tags[0]` vs `tags[1]`) instead of collapsing into identical messages.
 *
 * @param path Zod issue path.
 * @returns Parameter name, or `undefined` when the path is empty.
 */
export function issueName(path: IssuePath) {
  let name = "";

  for (const segment of path) {
    if (typeof segment === "number") {
      // A leading index has no field to suffix (root-level array): keep it
      // standalone rather than dropping it, or every element would collapse
      // to the same nameless message.
      name += `[${segment}]`;
      continue;
    }
    if (typeof segment !== "string" || segment.length === 0) {
      continue;
    }
    name = name.length > 0 ? `${name}.${segment}` : segment;
  }

  return name.length > 0 ? name : undefined;
}

function describeExpectedType(expected: string) {
  switch (expected) {
    case "string":
      return "une chaîne de caractères";
    case "number":
      return "un nombre";
    case "integer":
      return "un entier";
    case "boolean":
      return "un booléen";
    case "array":
      return "un tableau";
    case "object":
      return "un objet";
    case "date":
      return "une date";
    default:
      return `un type ${expected}`;
  }
}

function describeReceivedType(received: string) {
  switch (received) {
    case "undefined":
      return "non défini";
    case "null":
      return "null";
    case "nan":
      return "NaN";
    default:
      return `de type ${received}`;
  }
}

function formatTooSmallIssue(issue: TooSmallIssue) {
  if (issue.exact) {
    switch (issue.type) {
      case "string":
        return `La valeur doit contenir exactement ${issue.minimum} caractère(s).`;
      case "array":
        return `La valeur doit contenir exactement ${issue.minimum} élément(s).`;
      case "number":
      case "bigint":
        return `La valeur doit être exactement égale à ${issue.minimum}.`;
      default:
        return `La valeur doit être exactement égale à ${issue.minimum}.`;
    }
  }

  switch (issue.type) {
    case "string":
      return `La valeur doit contenir au moins ${issue.minimum} caractère(s).`;
    case "array":
      return `La valeur doit contenir au moins ${issue.minimum} élément(s).`;
    case "number":
    case "bigint":
      return `La valeur doit être au moins ${issue.minimum}.`;
    case "set":
      return `L'ensemble doit contenir au moins ${issue.minimum} élément(s).`;
    case "date":
      return "La date fournie est antérieure au minimum autorisé.";
    default:
      return `La valeur doit respecter une contrainte de borne (au moins ${issue.minimum}).`;
  }
}

function formatTooBigIssue(issue: TooBigIssue) {
  if (issue.exact) {
    switch (issue.type) {
      case "string":
        return `La valeur doit contenir exactement ${issue.maximum} caractère(s).`;
      case "array":
        return `La valeur doit contenir exactement ${issue.maximum} élément(s).`;
      case "number":
      case "bigint":
        return `La valeur doit être exactement égale à ${issue.maximum}.`;
      default:
        return `La valeur doit être exactement égale à ${issue.maximum}.`;
    }
  }

  switch (issue.type) {
    case "string":
      return `La valeur doit contenir au plus ${issue.maximum} caractère(s).`;
    case "array":
      return `La valeur doit contenir au plus ${issue.maximum} élément(s).`;
    case "number":
    case "bigint":
      return `La valeur doit être au plus ${issue.maximum}.`;
    case "set":
      return `L'ensemble doit contenir au plus ${issue.maximum} élément(s).`;
    case "date":
      return "La date fournie est postérieure au maximum autorisé.";
    default:
      return `La valeur doit respecter une contrainte de borne (au plus ${issue.maximum}).`;
  }
}

// --- FR Error Map ---

/**
 * Global Zod error map that localizes default messages in French.
 */
export const zodErrorMapFr: ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case "too_small":
      return { message: formatTooSmallIssue(issue) };
    case "too_big":
      return { message: formatTooBigIssue(issue) };
    case "invalid_type":
      if (issue.received === "undefined") {
        const name = issueName(issue.path);
        return {
          message: name
            ? `Le paramètre '${name}' est requis.`
            : "Un paramètre requis est manquant.",
        };
      }
      return {
        message: `Type invalide : attendu ${describeExpectedType(issue.expected)}, reçu une valeur ${describeReceivedType(issue.received)}.`,
      };
    case "invalid_enum_value":
      return {
        message: `Valeur invalide. Valeurs autorisées : ${issue.options.map((option) => `'${String(option)}'`).join(", ")}.`,
      };
    case "invalid_string":
      if (typeof issue.validation === "string") {
        switch (issue.validation) {
          case "email":
            return { message: "Format d'email invalide." };
          case "url":
            return { message: "Format d'URL invalide." };
          case "uuid":
            return { message: "Format UUID invalide." };
          case "datetime":
            return { message: "Format de date/heure invalide." };
          default:
            return { message: `Format de chaîne invalide (${issue.validation}).` };
        }
      }

      if ("includes" in issue.validation) {
        return { message: `La chaîne doit contenir '${issue.validation.includes}'.` };
      }
      if ("startsWith" in issue.validation) {
        return { message: `La chaîne doit commencer par '${issue.validation.startsWith}'.` };
      }
      if ("endsWith" in issue.validation) {
        return { message: `La chaîne doit se terminer par '${issue.validation.endsWith}'.` };
      }
      return { message: "Format de chaîne invalide." };
    case "unrecognized_keys":
      return {
        message: issue.keys.length > 0
          ? `Clé(s) non reconnue(s) : ${issue.keys.map((key) => `'${key}'`).join(", ")}.`
          : "Présence de clés non reconnues.",
      };
    case "custom":
      return { message: issue.message || "Valeur invalide." };
    default:
      return { message: ctx.defaultError };
  }
};

// --- Public API ---

/**
 * Installs the FR Zod error map once per process.
 */
export function installZodErrorMapFr() {
  if (isInstalled) {
    return;
  }

  z.setErrorMap(zodErrorMapFr);
  isInstalled = true;
}
