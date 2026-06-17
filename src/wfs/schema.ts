/**
 * Zod schemas and published MCP input schemas for the structured WFS engine.
 *
 * This module centralizes:
 * - shared schema fragments reused by WFS tools
 * - public tool input schemas and inferred input types
 * - compact output schemas used for `hits` and HTTP preview responses
 */

import { z } from "zod";

import { generatePublishedInputSchema } from "../helpers/jsonSchema.js";
import { lonSchema, latSchema } from "../helpers/schemas.js";
import { TRAVEL_TIME_MAX_MINUTES, TRAVEL_TIME_PROFILES } from "../gpf/navigation.js";

// --- Shared Constants ---

export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 5000;
export const WHERE_OPERATORS = ["eq", "ne", "lt", "lte", "gt", "gte", "in", "is_null"] as const;
export const ORDER_DIRECTIONS = ["asc", "desc"] as const;
export const GPF_WFS_GET_FEATURES_SPATIAL_FILTER_KEYS = [
  "bbox_filter",
  "intersects_point_filter",
  "dwithin_point_filter",
  "intersects_feature_filter",
  "travel_time_filter",
] as const;
export const GPF_WFS_GET_FEATURES_GEOMETRY_KEEP = [
  "centroid",
  "bbox"
] as const;

// --- Shared Clauses ---

const whereClauseSchema = z.object({
  property: z.string().trim().min(1).describe("Nom exact d'une propriété non géométrique du type WFS. Utiliser `gpf_wfs_describe_type` pour connaître les noms exacts disponibles."),
  operator: z.enum(WHERE_OPERATORS).describe("Opérateur de filtre : `eq`, `ne`, `lt`, `lte`, `gt`, `gte`, `in`, `is_null`."),
  value: z.string().optional().describe("Valeur scalaire sérialisée en texte, utilisée avec tous les opérateurs sauf `in` et `is_null`."),
  values: z.array(z.string()).min(1).optional().describe("Liste de valeurs sérialisées en texte, utilisée uniquement avec `operator = \"in\"`."),
}).strict().describe("Clause de filtre structurée. Exemple : `{ property: \"code_insee\", operator: \"eq\", value: \"75056\" }`.");

const orderBySchema = z.object({
  property: z.string().trim().min(1).describe("Nom exact d'une propriété non géométrique à utiliser pour le tri. Utiliser `gpf_wfs_describe_type` pour connaître les noms exacts disponibles."),
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
  typename: z.string().trim().min(1).describe("Type WFS du feature de référence."),
  feature_id: z.string().trim().min(1).describe("Identifiant du feature de référence."),
}).strict().describe("Filtre les objets dont la géométrie intersecte celle d'un objet WFS de référence.");

const travelTimeFilterSchema = z.object({
  lon: lonSchema.describe("Longitude du point de départ en WGS84 `lon/lat`."),
  lat: latSchema.describe("Latitude du point de départ en WGS84 `lon/lat`."),
  minutes: z
    .number()
    .finite()
    .positive()
    .max(TRAVEL_TIME_MAX_MINUTES)
    .describe(`Temps de trajet maximal en minutes. Maximum : ${TRAVEL_TIME_MAX_MINUTES}.`),
  profile: z
    .enum(TRAVEL_TIME_PROFILES)
    .describe("Mode de déplacement utilisé pour calculer l'isochrone (`car` ou `pedestrian`)."),
}).strict().describe("Filtre les objets situés dans une zone atteignable en un temps donné depuis un point.");

// --- Shared Compact Outputs ---

const wfsHttpPostRequestOutputSchema = z.object({
  result_type: z.literal("http_post_request").describe("Indique que la réponse contient une requête WFS POST robuste à exécuter par un client HTTP."),
  http_post_request: z.object({
    method: z.literal("POST").describe("Méthode HTTP à utiliser."),
    url: z.string().url().describe("URL WFS avec les paramètres query standards, hors `cql_filter`."),
    headers: z.object({
      "Content-Type": z.literal("application/x-www-form-urlencoded").describe("Type de contenu du corps POST."),
    }).strict().describe("En-têtes HTTP à envoyer avec la requête POST."),
    body: z.string().describe("Corps de la requête POST, encodé en `application/x-www-form-urlencoded`; contient `cql_filter=...` quand un filtre existe."),
  }).strict().describe("Requête HTTP POST complète à utiliser pour appeler directement le WFS."),
});

const wfsHttpGetUrlOutputSchema = z.object({
  result_type: z.literal("http_get_url").describe("Indique que la réponse contient l'URL GET WFS équivalente."),
  http_get_url: z.string().url().describe("URL GET WFS complète avec tous les paramètres, y compris `cql_filter`. Utile pour les consommateurs URL-first ou pour la visualisation dans un outil la supportant; pour une exécution HTTP robuste, préférer `http_post_request`."),
});

export const gpfWfsGetFeaturesHttpPostRequestOutputSchema = wfsHttpPostRequestOutputSchema;
export const gpfWfsGetFeaturesHttpGetUrlOutputSchema = wfsHttpGetUrlOutputSchema;
export const gpfWfsGetFeatureByIdHttpPostRequestOutputSchema = wfsHttpPostRequestOutputSchema;
export const gpfWfsGetFeatureByIdHttpGetUrlOutputSchema = wfsHttpGetUrlOutputSchema;

// --- `gpf_wfs_get_features` ---

export const gpfWfsGetFeaturesInputObjectSchema = z.object({
  typename: z
    .string()
    .trim()
    .min(1, "le nom du type ne doit pas être vide")
    .describe("Nom exact du type WFS à interroger, par exemple `BDTOPO_V3:batiment`. Utiliser `gpf_wfs_search_types` pour trouver un `typename` valide."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .default(DEFAULT_LIMIT)
    .describe(`Nombre maximum d'objets à renvoyer. Valeur par défaut : ${DEFAULT_LIMIT}. Maximum : ${MAX_LIMIT}.`),
  result_type: z
    .enum(["results", "hits", "http_post_request", "http_get_url"])
    .default("results")
    .describe("`results` renvoie une FeatureCollection avec les propriétés attributaires et le choix de `geometry_keep` en guise de géométrie . `hits` renvoie uniquement le nombre total d'objets correspondant à la requête. `http_post_request` renvoie une requête POST WFS robuste à exécuter directement. `http_get_url` renvoie l'URL GET WFS équivalente, utile pour les consommateurs URL-first ou pour la visualisation dans un outil la supportant. Avec `http_post_request` ou `http_get_url`, la géométrie complète est automatiquement ajoutée aux propriétés du `select` pour garantir l'affichage cartographique ; sinon, elle est omise."),
  select: z
    .array(z.string().trim().min(1))
    .min(1)
    .optional()
    .describe("Liste des propriétés non géométriques à renvoyer pour chaque objet. Utiliser `gpf_wfs_describe_type` pour connaître les noms exacts disponibles. Exemple : `[\"code_insee\", \"nom_officiel\"]`."),
  geometry_keep: z
    .array(z.enum(GPF_WFS_GET_FEATURES_GEOMETRY_KEEP))
    .default([])
    .transform((val) => [...new Set(val)])
    .describe("Éléments de géométrie à renvoyer pour `result_type=results`. Peut inclure `centroid` et `bbox`, aucun par défaut."),
  order_by: z
    .array(orderBySchema)
    .min(1)
    .optional()
    .describe("Liste ordonnée des critères de tri."),
  where: z
    .array(whereClauseSchema)
    .min(1)
    .optional()
    .describe("Clauses de filtre attributaire, combinées avec `AND`."),
  bbox_filter: bboxFilterSchema
    .optional()
    .describe("Filtre spatial par boîte englobante. Exclusif avec les autres filtres spatiaux."),
  intersects_point_filter: intersectsPointFilterSchema
    .optional()
    .describe("Filtre spatial par intersection avec un point. Exclusif avec les autres filtres spatiaux."),
  dwithin_point_filter: dwithinPointFilterSchema
    .optional()
    .describe("Filtre spatial par distance à un point. Exclusif avec les autres filtres spatiaux."),
  intersects_feature_filter: intersectsFeatureFilterSchema
    .optional()
    .describe("Filtre spatial par intersection avec un feature WFS de référence. Exclusif avec les autres filtres spatiaux."),
  travel_time_filter: travelTimeFilterSchema
    .optional()
    .describe("Filtre spatial par temps de trajet depuis un point (`profile` voiture ou piéton). Exclusif avec les autres filtres spatiaux."),
}).strict();

export const gpfWfsGetFeaturesInputSchema = gpfWfsGetFeaturesInputObjectSchema.superRefine((input, ctx) => {
  const usedSpatialFilters = GPF_WFS_GET_FEATURES_SPATIAL_FILTER_KEYS.filter((key) => input[key] !== undefined);

  if (usedSpatialFilters.length > 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["spatial_filters"],
      message: `Un seul filtre spatial est autorisé (${usedSpatialFilters.join(", ")} fournis).`,
    });
  }

  if (input.geometry_keep.length > 0 && input.result_type != "results") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["geometry_keep"],
      message: "`geometry_keep` ne peut être utilisé qu'avec `result_type=results`. Si `result_type=hits`, aucune géométrie n'est renvoyée et dans cas `http_post_request` et `http_get_url`, la géométrie complète est renvoyée par la requête."
    })
  }
});

// --- `gpf_wfs_get_features` Types ---

export type GpfWfsGetFeaturesInput = z.infer<typeof gpfWfsGetFeaturesInputSchema>;
export type SpatialFilter =
  | ({ operator: "bbox" } & NonNullable<GpfWfsGetFeaturesInput["bbox_filter"]>)
  | ({ operator: "intersects_point" } & NonNullable<GpfWfsGetFeaturesInput["intersects_point_filter"]>)
  | ({ operator: "dwithin_point" } & NonNullable<GpfWfsGetFeaturesInput["dwithin_point_filter"]>)
  | ({ operator: "intersects_feature" } & NonNullable<GpfWfsGetFeaturesInput["intersects_feature_filter"]>)
  | ({ operator: "travel_time" } & NonNullable<GpfWfsGetFeaturesInput["travel_time_filter"]>);
export type WhereClause = NonNullable<GpfWfsGetFeaturesInput["where"]>[number];
export type OrderByClause = NonNullable<GpfWfsGetFeaturesInput["order_by"]>[number];

// --- `gpf_wfs_get_features` Outputs ---

export const gpfWfsGetFeaturesHitsOutputSchema = z.object({
  result_type: z.literal("hits").describe("Indique que la réponse contient uniquement un comptage."),
  totalFeatures: z.number().describe("Le nombre total d'objets correspondant à la requête."),
});

// --- `gpf_wfs_get_features` Published Schema ---

export const gpfWfsGetFeaturesPublishedInputSchema = generatePublishedInputSchema(gpfWfsGetFeaturesInputObjectSchema);

// --- `gpf_wfs_get_feature_by_id` ---

export const gpfWfsGetFeatureByIdInputObjectSchema = z.object({
  typename: z
    .string()
    .trim()
    .min(1, "le nom du type ne doit pas être vide")
    .describe("Nom exact du type WFS à interroger, par exemple `ADMINEXPRESS-COG.LATEST:commune`."),
  feature_id: z
    .string()
    .trim()
    .min(1, "le feature_id ne doit pas être vide")
    .describe("Identifiant WFS exact de l'objet à récupérer, par exemple `commune.8952`."),
  result_type: z
    .enum(["results", "http_post_request", "http_get_url"])
    .default("results")
    .describe("`results` renvoie une FeatureCollection normalisée avec exactement un objet et le choix de `geometry_keep` en guise de géométrie. `http_post_request` renvoie une requête POST WFS robuste à exécuter directement. `http_get_url` renvoie l'URL GET WFS équivalente, utile pour les consommateurs URL-first ou pour la visualisation dans un outil la supportant. Avec `http_post_request` ou `http_get_url`, la géométrie complète est automatiquement ajoutée aux propriétés du `select` pour garantir l'affichage cartographique ; sinon, elle est omise."),
  select: z
    .array(z.string().trim().min(1))
    .min(1)
    .optional()
    .describe("Liste des propriétés non géométriques à renvoyer. Utiliser `gpf_wfs_describe_type` pour connaître les noms exacts disponibles. Exemple : `[\"code_insee\", \"nom_officiel\"]`."),
  geometry_keep: z
    .array(z.enum(GPF_WFS_GET_FEATURES_GEOMETRY_KEEP))
    .default([])
    .transform((val) => [...new Set(val)])
    .describe("Éléments de géométrie à renvoyer pour `result_type=results`. Peut inclure `centroid` et `bbox`, aucun par défaut."),
}).strict();

export const gpfWfsGetFeatureByIdInputSchema = gpfWfsGetFeatureByIdInputObjectSchema.superRefine((input, ctx) => {
  if (input.geometry_keep.length > 0 && input.result_type != "results") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["geometry_keep"],
      message: "`geometry_keep` ne peut être utilisé qu'avec `result_type=results`. Dans les autres cas, la géométrie complète est toujours renvoyée par la requête."
    })
  }
});

// --- `gpf_wfs_get_feature_by_id` Types ---

export type GpfWfsGetFeatureByIdInput = z.infer<typeof gpfWfsGetFeatureByIdInputSchema>;

// --- `gpf_wfs_get_feature_by_id` Published Schema ---

export const gpfWfsGetFeatureByIdPublishedInputSchema = generatePublishedInputSchema(gpfWfsGetFeatureByIdInputSchema);
