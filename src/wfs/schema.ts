/**
 * Zod schemas and published MCP input schemas for the structured WFS engine.
 *
 * This module centralizes:
 * - shared schema fragments reused by WFS tools
 * - public tool input schemas and inferred input types
 */

import { z } from "zod";

import { generatePublishedInputSchema } from "../helpers/jsonSchema.js";
import { lonSchema, latSchema } from "../helpers/schemas.js";
import {
  NAVIGATION_COST_TYPES,
  NAVIGATION_MAX_DISTANCE_METERS,
  NAVIGATION_PROFILES,
  NAVIGATION_MAX_TIME_MINUTES,
  type NavigationCostType,
} from "../gpf/navigation.js";

// --- Shared Constants ---

export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 5000;
export const WHERE_OPERATORS = ["eq", "ne", "lt", "lte", "gt", "gte", "in", "is_null"] as const;
export const ORDER_DIRECTIONS = ["asc", "desc"] as const;

export const GPF_GET_FEATURE_BY_ID_SPATIAL_EXTRAS = [
  "centroid",
  "bbox",
  "length",
  "area",
] as const;
export const GPF_SPATIAL_EXTRAS_REQUIRING_FILTER = [
  "distance_to_filter",
  "intersection_area",
] as const;
export const GPF_GET_FEATURES_SPATIAL_EXTRAS = [
  ...GPF_GET_FEATURE_BY_ID_SPATIAL_EXTRAS,
  ...GPF_SPATIAL_EXTRAS_REQUIRING_FILTER,
] as const;

export type SpatialExtraRequiringFilterOption = typeof GPF_SPATIAL_EXTRAS_REQUIRING_FILTER[number];

export type SpatialExtraOptions = typeof GPF_GET_FEATURES_SPATIAL_EXTRAS[number];

export function spatialExtraRequiresFilter(
  extra: SpatialExtraOptions,
): extra is SpatialExtraRequiringFilterOption {
  return GPF_SPATIAL_EXTRAS_REQUIRING_FILTER.includes(extra as SpatialExtraRequiringFilterOption);
}

export const GPF_SPATIAL_EXTRAS_DOCNAMES = GPF_GET_FEATURES_SPATIAL_EXTRAS
  .map((name) => `\`${name}\``)
  .join(", ")
  .replace(/, ([^,]*)$/, ' et $1');

export const GPF_GET_FEATURE_BY_ID_SPATIAL_EXTRAS_DOCNAMES = GPF_GET_FEATURE_BY_ID_SPATIAL_EXTRAS
  .map((name) => `\`${name}\``)
  .join(", ")
  .replace(/, ([^,]*)$/, ' et $1');

// --- Shared Clauses ---

const whereClauseSchema = z.object({
  property: z.string().trim().min(1).describe("Nom exact d'une propriété non géométrique du type GPF. Utiliser `gpf_describe_type` pour connaître les noms exacts disponibles."),
  operator: z.enum(WHERE_OPERATORS).describe("Opérateur de filtre : `eq`, `ne`, `lt`, `lte`, `gt`, `gte`, `in`, `is_null`."),
  value: z.string().trim().min(1).optional().describe("Valeur scalaire sérialisée en texte, utilisée avec tous les opérateurs sauf `in` et `is_null`."),
  values: z.array(z.string().trim().min(1)).min(1).optional().describe("Liste de valeurs sérialisées en texte, utilisée uniquement avec `operator = \"in\"`."),
}).strict().describe("Clause de filtre structurée. Exemple : `{ property: \"code_insee\", operator: \"eq\", value: \"75056\" }`.");

const orderBySchema = z.object({
  property: z.string().trim().min(1).describe("Nom exact d'une propriété non géométrique à utiliser pour le tri. Utiliser `gpf_describe_type` pour connaître les noms exacts disponibles."),
  direction: z.enum(ORDER_DIRECTIONS).default("asc").describe("Direction de tri : `asc` ou `desc`."),
}).strict().describe("Critère de tri structuré. Exemple : `{ property: \"population\", direction: \"desc\" }`.");

const bboxFilterSchema = z.object({
  west: lonSchema.describe("Longitude ouest en WGS84 `lon/lat`."),
  south: latSchema.describe("Latitude sud en WGS84 `lon/lat`."),
  east: lonSchema.describe("Longitude est en WGS84 `lon/lat`."),
  north: latSchema.describe("Latitude nord en WGS84 `lon/lat`."),
}).strict().describe("Filtre spatial par boîte englobante.");

const intersectsPointFilterSchema = z.object({
  lon: lonSchema.describe("Longitude du point en WGS84 `lon/lat`."),
  lat: latSchema.describe("Latitude du point en WGS84 `lon/lat`."),
}).strict().describe("Filtre les objets dont la géométrie intersecte un point.");

const dwithinPointFilterSchema = z.object({
  lon: lonSchema.describe("Longitude du point en WGS84 `lon/lat`."),
  lat: latSchema.describe("Latitude du point en WGS84 `lon/lat`."),
  distance_m: z.number().finite().positive().describe("Distance maximale en mètres."),
}).strict().describe("Filtre les objets situés à une distance maximale d'un point.");

const intersectsFeatureFilterSchema = z.object({
  typename: z.string().trim().min(1).describe("Type GPF du feature de référence."),
  feature_id: z.string().trim().min(1).describe("Identifiant du feature de référence."),
}).strict().describe("Filtre les objets dont la géométrie intersecte celle d'un objet GPF de référence.");

const navigationProfileSchema = z
  .enum(NAVIGATION_PROFILES)
  .describe("Mode de déplacement utilisé pour calculer l'isochrone ou l'isodistance : `car` ou `pedestrian`.");

// Departure point of an isoline. Flat `lon`/`lat`, exactly like every spatial
// filter (`intersects_point_filter`, `dwithin_point_filter`, ...), so the LLM sees
// one point convention across the whole surface.
const isolinePointSchema = z.object({
  lon: lonSchema.describe("Longitude du point de départ en WGS84 `lon/lat`."),
  lat: latSchema.describe("Latitude du point de départ en WGS84 `lon/lat`."),
}).strict();

const navigationCostTypeSchema = z
  .enum(NAVIGATION_COST_TYPES)
  .describe("Type de coût utilisé : `time` pour une isochrone, `distance` pour une isodistance.");

const isolineCostValueSchema = z
  .number()
  .finite()
  .positive()
  .describe(`Valeur du coût maximal. Interprétée en minutes si \`cost_type = \"time\"\` (maximum : ${NAVIGATION_MAX_TIME_MINUTES}), et en mètres si \`cost_type = \"distance\"\` (maximum : ${NAVIGATION_MAX_DISTANCE_METERS}).`);

const isolineCostSchema = z.object({
  profile: navigationProfileSchema,
  cost_type: navigationCostTypeSchema,
  cost_value: isolineCostValueSchema,
}).strict();

type CostLimits = Record<NavigationCostType, { max: number; name: string; unit: string }>

// One max per cost type: `cost_value` is minutes for `time` and meters for
// `distance`, so the ceiling can only be checked once `cost_type` is known.
const ISOLINE_COST_LIMITS: CostLimits = {
  time: { max: NAVIGATION_MAX_TIME_MINUTES, name: "temps", unit: "minutes" },
  distance: { max: NAVIGATION_MAX_DISTANCE_METERS, name: "distance", unit: "mètres" },
};

const ISOLINE_FILTER_COST_LIMITS: CostLimits = {
  ...ISOLINE_COST_LIMITS,
  // lower limit for performance
  time: { ...ISOLINE_COST_LIMITS.time, max: 120 },
}

function assertIsolineCostValue(limits: CostLimits) {
  return (input: { cost_type: NavigationCostType; cost_value: number }, ctx: z.RefinementCtx) => {
    const { max, name, unit } = limits[input.cost_type];

    if (input.cost_value > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_big,
        maximum: max,
        type: "number",
        inclusive: true,
        path: ["cost_value"],
        message: `Le coût maximal en ${name} ne peut pas dépasser ${max} ${unit}.`,
      });
    }
  }
}

const isolineFilterSchema = isolinePointSchema
  .merge(isolineCostSchema)
  .superRefine(assertIsolineCostValue(ISOLINE_FILTER_COST_LIMITS))
  .describe("Filtre les objets situés dans une isochrone (temps de trajet maximum fixé) ou une isodistance (distance maximale fixée) autour d'un point.");

// --- Shared GPF Inputs ---

const gpfTypenameInputSchema = z.object({
  typename: z
    .string()
    .trim()
    .min(1, "le nom du type ne doit pas être vide")
    .describe("Nom exact du type GPF à interroger de la forme `prefixe:nom`. Utiliser `gpf_search_types` pour trouver un `typename` valide.")
})

const gpfWhereFilterInputSchema = z.object({
  where: z
    .array(whereClauseSchema)
    .min(1)
    .optional()
    .describe("Clauses de filtre attributaire, combinées avec `AND`.")
})

const gpfSpatialFilterInputSchema = z.object({
  bbox_filter: bboxFilterSchema
    .optional()
    .describe("Filtre spatial par boîte englobante. Exclusif avec les autres filtres spatiaux."),
  intersects_point_filter: intersectsPointFilterSchema
    .optional()
    .describe("Filtre spatial par intersection avec un point. Exclusif avec les autres filtres spatiaux."),
  dwithin_point_filter: dwithinPointFilterSchema
    .optional()
    .describe("Filtre spatial par distance à un point à vol d'oiseau. Exclusif avec les autres filtres spatiaux."),
  intersects_feature_filter: intersectsFeatureFilterSchema
    .optional()
    .describe("Filtre spatial par intersection avec un feature GPF de référence. Exclusif avec les autres filtres spatiaux."),
  isoline_filter: isolineFilterSchema
    .optional()
    .describe("Filtre spatial par temps de trajet (isochrone) ou par distance (isodistance) depuis un point avec un profil voiture ou piéton. Exclusif avec les autres filtres spatiaux."),
})

export const GPF_GET_FEATURES_SPATIAL_FILTER_KEYS =
  gpfSpatialFilterInputSchema.keyof().options;
export const GPF_SPATIAL_FILTER_DOCNAMES = GPF_GET_FEATURES_SPATIAL_FILTER_KEYS
  .map((name) => `\`${name}\``)
  .join(", ")
  .replace(/, ([^,]*)$/, ' ou $1');

const SPATIAL_EXTRAS_BASE_DESCRIPTION_LINES = [
  "`centroid` est le centroïde (moyenne arithmétique des sommets) de la géométrie.",
  "`bbox` est la boîte englobante de la géométrie.",
  "`length` est la somme des longueurs (en m) des parties linéaires de la géométrie (LineString, MultiLineString).",
  "`area` est la somme des surfaces (en m²) des parties surfaciques de la géométrie (Polygon, MultiPolygon).",
] as const;

function buildSpatialExtrasDescription(
  target: string,
  allowedExtrasDocNames: string,
  filterDependentDescriptionLine: string,
) {
  const optionalFilterLine = filterDependentDescriptionLine
    ? `${filterDependentDescriptionLine}\n`
    : "";
  return `Éléments calculés depuis la géométrie à renvoyer pour ${target}. Peut inclure ${allowedExtrasDocNames}, aucun par défaut.\n`+
    `${SPATIAL_EXTRAS_BASE_DESCRIPTION_LINES.join("\n")}\n`+
    optionalFilterLine+
    "Si l'élément à calculer est incompatible avec la géométrie (exemple : bbox d'un point, aire d'une géométrie linéaire) et que le type de la géométrie est connu à l'avance, une erreur indiquera comment corriger la requête.\n"+
    "Sinon, un élément qui n'est pas calculable pour un objet (géométrie absente ou vide, aucune partie de la dimension requise) vaut `null`. Une valeur numérique, `0` compris, signifie que le calcul a bien eu lieu.";
}

/** For each filter-dependent extra, the spatial filter that makes it meaningless, and why. */
const FILTER_DEPENDENT_EXTRA_RULES: Record<SpatialExtraRequiringFilterOption, {
  incompatibleFilter: SpatialFilterKey;
  incompatibleReason: string;
}> = {
  distance_to_filter: {
    incompatibleFilter: "intersects_point_filter",
    incompatibleReason: "vaut toujours 0 avec `intersects_point_filter`, puisque chaque objet renvoyé contient le point : pour classer des objets selon leur distance à un point, utilisez plutôt `dwithin_point_filter`",
  },
  intersection_area: {
    incompatibleFilter: "intersects_point_filter",
    incompatibleReason: "ne peut pas être calculé avec `intersects_point_filter`, car un point n'a pas de surface : utilisez plutôt un filtre surfacique",
  },
};

/**
 * Rejects the filter-dependent extras (`distance_to_filter`, `intersection_area`)
 * when no spatial filter is given, or when the given filter makes them meaningless.
 * Both only depend on the input, hence invalid tool parameters rather than
 * execution errors.
 */
function assertSpatialExtraSpatialFilterConsistency(input: z.infer<typeof gpfGetFeaturesInputObjectSchema>, ctx: z.RefinementCtx) {
  const usedSpatialFilters = GPF_GET_FEATURES_SPATIAL_FILTER_KEYS.filter((key) => input[key] !== undefined);

  for (const extra of input.spatial_extras.filter(spatialExtraRequiresFilter)) {
    const { incompatibleFilter, incompatibleReason } = FILTER_DEPENDENT_EXTRA_RULES[extra];

    if (usedSpatialFilters.length === 0) {
      const compatibleFilters = GPF_GET_FEATURES_SPATIAL_FILTER_KEYS
        .filter((key) => key !== incompatibleFilter)
        .map((name) => `\`${name}\``)
        .join(", ")
        .replace(/, ([^,]*)$/, ' ou $1');
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["spatial_extras"],
        message: `\`${extra}\` exige un filtre spatial (${compatibleFilters}) : ajoutez un de ces filtres, ou retirez \`${extra}\` de \`spatial_extras\`.`,
      });
    } else if (usedSpatialFilters.includes(incompatibleFilter)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["spatial_extras"],
        message: `\`${extra}\` ${incompatibleReason}, ou retirez \`${extra}\` de \`spatial_extras\`.`,
      });
    }
  }
}

const gpfGetFeaturesGeometryExtraInputSchema = z.object({
  spatial_extras: z
    .array(z.enum(GPF_GET_FEATURES_SPATIAL_EXTRAS))
    .default([])
    .transform((val) => [...new Set(val)])
    .describe(buildSpatialExtrasDescription(
      "chaque objet",
      GPF_SPATIAL_EXTRAS_DOCNAMES,
      "`distance_to_filter` est la distance (en m) entre la géométrie de l'objet renvoyé et le centroïde du filtre spatial (le point de départ dans le cas de `isoline_filter`).\n"+
      "`intersection_area` est l'aire (en m²) de la partie de l'objet renvoyé située dans le filtre spatial. L'objet et le filtre doivent être surfaciques, sinon la valeur est `null` ; `0` signifie que l'objet ne recouvre pas le filtre.\n"+
      "`distance_to_filter` et `intersection_area` exigent un filtre spatial.\n"+
      "Les `spatial_extras` sont calculés après la requête, sur les seuls objets renvoyés : ils ne sont utilisables ni dans `where` ni dans `order_by`. Pour un classement (les N plus grands, le plus proche) ou une somme, vérifier que `numberReturned` est égal à `numberMatched`, sinon augmenter `limit`."
    )),
});

const gpfGetFeatureByIdGeometryExtraInputSchema = z.object({
  spatial_extras: z
    .array(z.enum(GPF_GET_FEATURE_BY_ID_SPATIAL_EXTRAS))
    .default([]) // ensure that spatial_extra is not optional, which is mandatory to ensure queryIsGetFeaturesInput correctness
    .transform((val) => [...new Set(val)])
    .describe(buildSpatialExtrasDescription(
      "l'objet",
      GPF_GET_FEATURE_BY_ID_SPATIAL_EXTRAS_DOCNAMES,
      "",
    )),
});

function assertSpatialFilterExclusion(input : Record<string, unknown>, ctx : z.RefinementCtx) {
  const usedSpatialFilters = GPF_GET_FEATURES_SPATIAL_FILTER_KEYS.filter((key) => input[key] !== undefined);

  if (usedSpatialFilters.length > 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["spatial_filters"],
      message: `Un seul filtre spatial est autorisé (${usedSpatialFilters.join(", ")} fournis).`,
    });
  }
}

// --- Shared GPF types ---

export type WhereClause = z.infer<typeof whereClauseSchema>;

export type OrderByClause = z.infer<typeof orderBySchema>;

type SpatialFilterKey = (typeof GPF_GET_FEATURES_SPATIAL_FILTER_KEYS)[number];
export type SpatialFilterInput = z.infer<typeof gpfSpatialFilterInputSchema>;

type SpatialFilterEntry<K extends SpatialFilterKey> =
  K extends `${infer Operator}_filter`
    ? { operator: Operator } & SpatialFilterInput[K]
    : never;

export type SpatialFilter = SpatialFilterEntry<SpatialFilterKey>;

// --- `gpf_get_features` ---

export const gpfGetFeaturesInputObjectSchema = gpfTypenameInputSchema
  .merge(z.object({
    select: z
    .array(z.string().trim().min(1))
    .min(1)
    .optional()
    .describe("Liste des propriétés non géométriques à renvoyer pour chaque objet. Utiliser `gpf_describe_type` pour connaître les noms exacts disponibles. Exemple : `[\"code_insee\", \"nom_officiel\"]`."),
  }))
  .merge(gpfWhereFilterInputSchema)
  .merge(gpfSpatialFilterInputSchema)
  .merge(z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .default(DEFAULT_LIMIT)
    .describe(`Nombre maximum d'objets à renvoyer. Valeur par défaut : ${DEFAULT_LIMIT}. Maximum : ${MAX_LIMIT}.`),
  order_by: z
    .array(orderBySchema)
    .min(1)
    .optional()
    .describe("Liste ordonnée des critères de tri."),
  }))
  .merge(gpfGetFeaturesGeometryExtraInputSchema)
  .strict();

export const gpfGetFeaturesInputSchema = gpfGetFeaturesInputObjectSchema
  .superRefine(assertSpatialFilterExclusion)
  .superRefine(assertSpatialExtraSpatialFilterConsistency);

// --- `gpf_get_features` Types ---

export type GpfGetFeaturesInput = z.infer<typeof gpfGetFeaturesInputSchema>;

// --- `gpf_get_features` Published Schema ---

export const gpfGetFeaturesPublishedInputSchema = generatePublishedInputSchema(gpfGetFeaturesInputObjectSchema);

// --- `gpf_get_features_layer` (proxy) ---

// The stateless proxy carries the same query surface as `gpf_get_features` MINUS
// the LLM-only knob `spatial_extras` (the proxy always returns full-geometry
// GeoJSON, so the derived-geometry extras have no meaning). Derived from the
// object schema so the fragments stay defined once. The plain object variant is
// what the tool publishes (the framework needs a non-transformed Zod object); the
// transform re-injects `spatial_extras: []` so the parsed value is a valid
// `GpfGetFeaturesInput` for the engine.
// `limit` is also overridden: the attribute tool `gpf_get_features` keeps a low
// default (100) to protect the LLM context, but a MAP LAYER wants the COMPLETE
// result set — and the tool returns only an opaque `data_url`, so a low default
// would silently truncate the rendered map with no cardinality feedback. Default
// to MAX_LIMIT (the GPF server-side cap, i.e. "as many as the service returns");
// the LLM can still lower it for a lighter map, and the proxy byte cap
// (PROXY_MAX_RESPONSE_BYTES) stays the real volume guard for dense layers.
export const gpfGetFeaturesLayerInputObjectSchema = gpfGetFeaturesInputObjectSchema
  .omit({ spatial_extras: true, limit: true })
  .merge(
    z.object({
      limit: z
        .number()
        .int()
        .min(1)
        .max(MAX_LIMIT)
        .default(MAX_LIMIT)
        .describe(`Nombre maximum d'objets à cartographier. Valeur par défaut : ${MAX_LIMIT} (plafond du service). Réduire pour alléger la carte. Maximum : ${MAX_LIMIT}. Une requête produisant plus de ${MAX_LIMIT} objets sera tronquée.`),
    }),
  )
  .strict();

export const gpfGetFeaturesLayerInputSchema = gpfGetFeaturesLayerInputObjectSchema
  .transform((value): GpfGetFeaturesInput => ({
    ...value,
    spatial_extras: [],
  }))
  .superRefine((value, ctx) => assertSpatialFilterExclusion(value, ctx));

export type GpfGetFeaturesLayerInput = z.input<typeof gpfGetFeaturesLayerInputSchema>;

// --- `gpf_get_features_layer` Published Schema ---

export const gpfGetFeaturesLayerPublishedInputSchema = generatePublishedInputSchema(gpfGetFeaturesLayerInputObjectSchema);

// --- `gpf_get_features_layer` Outputs ---

// Shared by both layer-producer tools (`gpf_get_features_layer` and
// `gpf_get_feature_by_id_layer`): the opaque URL output has the same shape
// regardless of which query kind produced it.
export const gpfGetFeaturesLayerOutputSchema = z.object({
  data_url: z
    .string()
    .url()
    .describe("URL renvoyant une FeatureCollection GeoJSON (géométries complètes) prête à être affichée dans un outil cartographique."),
}).strict();

// --- Proxy token discriminant ---

// The proxy serves ONE opaque token (in the URL path, `${endpoint}/<token>.json`)
// but several token kinds (a filtered layer query, a single-feature by-id lookup
// and an isoline). Every producer tool stamps its token
// with this `kind` discriminant; the proxy reads it to dispatch to the right
// schema + engine, then strips it before the strict per-kind `.parse`. It is
// injected by the tool from validated params — never an LLM-supplied field.
export const PROXY_TOKEN_KIND = {
  query: "query",
  byId: "by_id",
  isoline: "isoline",
} as const;

export type ProxyTokenKind = (typeof PROXY_TOKEN_KIND)[keyof typeof PROXY_TOKEN_KIND];

// --- `gpf_get_feature_by_id_layer` (proxy) ---

// Fields shared by the attribute and cartographic by-id tools. `select` only
// controls non-geometric properties; the cartographic path always adds the
// catalog geometry column itself.
const gpfFeatureByIdCoreInputSchema = z.object({
  typename: z
    .string()
    .trim()
    .min(1, "le nom du type ne doit pas être vide")
    .describe("Nom exact du type GPF à interroger, par exemple `ADMINEXPRESS-COG.LATEST:commune`."),
  feature_id: z
    .string()
    .trim()
    .min(1, "le feature_id ne doit pas être vide")
    .describe("Identifiant GPF exact de l'objet à récupérer, par exemple `commune.8952`."),
  select: z
    .array(z.string().trim().min(1))
    .min(1)
    .optional()
    .describe("Liste des propriétés non géométriques à renvoyer. Utiliser `gpf_describe_type` pour connaître les noms exacts disponibles. Exemple : `[\"code_insee\", \"nom_officiel\"]`."),
});

// Map-layer counterpart of `gpf_get_feature_by_id`: no attribute/spatial filters
// and no `spatial_extras`, but an optional catalog-validated `select` to reduce
// the returned attributes while retaining the complete geometry.
export const gpfGetFeatureByIdLayerInputObjectSchema = gpfFeatureByIdCoreInputSchema.strict();

export type GpfGetFeatureByIdLayerInput = z.infer<typeof gpfGetFeatureByIdLayerInputObjectSchema>;

// --- `gpf_get_feature_by_id_layer` Published Schema ---

export const gpfGetFeatureByIdLayerPublishedInputSchema = generatePublishedInputSchema(gpfGetFeatureByIdLayerInputObjectSchema);

// --- `gpf_isoline_layer` (proxy) ---

export const gpfIsolineLayerInputObjectSchema = isolinePointSchema
  .merge(isolineCostSchema)
  .strict();

export const gpfIsolineLayerInputSchema = gpfIsolineLayerInputObjectSchema
  .superRefine(assertIsolineCostValue(ISOLINE_COST_LIMITS));

export type GpfIsolineLayerInput = z.infer<typeof gpfIsolineLayerInputSchema>;

export const gpfIsolineLayerPublishedInputSchema = generatePublishedInputSchema(gpfIsolineLayerInputObjectSchema);

// --- `gpf_count_features` ---

export const gpfCountFeaturesInputObjectSchema = gpfTypenameInputSchema
  .merge(gpfWhereFilterInputSchema)
  .merge(gpfSpatialFilterInputSchema)
  .strict();

export const gpfCountFeaturesInputSchema = gpfCountFeaturesInputObjectSchema.superRefine(assertSpatialFilterExclusion);

// --- `gpf_count_features` Outputs ---

export const gpfCountFeaturesOutputSchema = z.object({
  numberMatched: z.number().describe("Le nombre d'objets correspondant à la requête."),
});

// --- `gpf_count_features` Types ---

export type GpfCountFeaturesInput = z.infer<typeof gpfCountFeaturesInputSchema>;

// --- `gpf_count_features` Published Schema ---

export const gpfCountFeaturesPublishedInputSchema = generatePublishedInputSchema(gpfCountFeaturesInputObjectSchema);

// --- Hybrid `gpf_get_features` / `gpf_count_features` schema ---

export type GpfQueryFeaturesInput = GpfGetFeaturesInput | GpfCountFeaturesInput

/** Checks whether the input is that of a GetFeatures / GetFeatureById, instead of a CountFeatures request */
export function queryIsGetFeaturesInput(input: GpfQueryFeaturesInput) : input is GpfGetFeaturesInput {
  return "spatial_extras" in input;
}

// --- `gpf_get_feature_by_id` ---

export const gpfGetFeatureByIdInputObjectSchema = gpfFeatureByIdCoreInputSchema
  .merge(gpfGetFeatureByIdGeometryExtraInputSchema)
  .strict();

export const gpfGetFeatureByIdInputSchema = gpfGetFeatureByIdInputObjectSchema;

export type GpfGetFeatureByIdInput = z.infer<typeof gpfGetFeatureByIdInputSchema>;

// --- `gpf_get_feature_by_id` Published Schema ---

export const gpfGetFeatureByIdPublishedInputSchema = generatePublishedInputSchema(gpfGetFeatureByIdInputObjectSchema);
