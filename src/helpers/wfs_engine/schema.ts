/**
 * Zod schemas and published MCP input schemas for the structured WFS engine.
 *
 * This module centralizes:
 * - shared schema fragments reused by WFS tools
 * - public tool input schemas and inferred input types
 * - compact output schemas used for `hits` and `request` responses
 */

import { z } from "zod";

import { generatePublishedInputSchema } from "../jsonSchema.js";
import { lonSchema, latSchema } from "../schemas.js";

// --- Shared Constants ---

export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 5000;
export const REQUEST_GET_URL_MAX_LENGTH = 6000;
export const WHERE_OPERATORS = ["eq", "ne", "lt", "lte", "gt", "gte", "in", "is_null"] as const;
export const SPATIAL_FILTER_TYPES = ["bbox", "intersects_point", "dwithin_point", "intersects_feature"] as const;
export const ORDER_DIRECTIONS = ["asc", "desc"] as const;

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

const spatialPointSchema = z.object({
  lon: lonSchema.describe("Longitude du point en WGS84 `lon/lat`."),
  lat: latSchema.describe("Latitude du point en WGS84 `lon/lat`."),
}).strict().describe("Point en WGS84 `lon/lat`.");

const spatialBboxSchema = z.object({
  west: lonSchema.describe("Longitude ouest en WGS84 `lon/lat`."),
  south: latSchema.describe("Latitude sud en WGS84 `lon/lat`."),
  east: lonSchema.describe("Longitude est en WGS84 `lon/lat`."),
  north: latSchema.describe("Latitude nord en WGS84 `lon/lat`."),
}).strict().describe("Boite englobante en WGS84 `lon/lat`.");

const spatialFeatureRefSchema = z.object({
  typename: z.string().trim().min(1).describe("Type WFS du feature de référence."),
  feature_id: z.string().trim().min(1).describe("Identifiant du feature de référence."),
}).strict().describe("Référence légère vers un feature WFS réutilisable.");

export const spatialFilterSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("bbox"),
    bbox: spatialBboxSchema,
  }).strict().describe("Filtre spatial par boite englobante."),
  z.object({
    type: z.literal("intersects_point"),
    point: spatialPointSchema,
  }).strict().describe("Filtre spatial par intersection avec un point."),
  z.object({
    type: z.literal("dwithin_point"),
    point: spatialPointSchema,
    distance_m: z.number().finite().positive().describe("Distance en metres."),
  }).strict().describe("Filtre spatial par distance autour d'un point."),
  z.object({
    type: z.literal("intersects_feature"),
    feature_ref: spatialFeatureRefSchema,
  }).strict().describe("Filtre spatial par intersection avec un feature de reference."),
]);

// --- Shared Types ---

export type SpatialPoint = {
  lon: number;
  lat: number;
};

export type SpatialBbox = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type SpatialFeatureRef = {
  typename: string;
  feature_id: string;
};

export type SpatialFilter =
  | { type: "bbox"; bbox: SpatialBbox }
  | { type: "intersects_point"; point: SpatialPoint }
  | { type: "dwithin_point"; point: SpatialPoint; distance_m: number }
  | { type: "intersects_feature"; feature_ref: SpatialFeatureRef };

// --- Shared Compact Outputs ---

const wfsRequestOutputSchema = z.object({
  result_type: z.literal("request").describe("Indique que la réponse contient la requête WFS compilée (équivalent enrichi géométrie pour `create_map` et le débogage)."),
  method: z.literal("POST").describe("Méthode HTTP réellement utilisée pour exécuter la requête."),
  url: z.string().describe("URL de base appelée pour la requête POST."),
  query: z.record(z.string()).describe("Paramètres WFS envoyés dans la query string."),
  body: z.string().describe("Corps de la requête POST, encodé en `application/x-www-form-urlencoded`."),
  get_url: z.string().nullable().optional().describe("URL GET dérivée quand la requête reste raisonnablement portable en GET."),
});

export const gpfWfsGetFeaturesRequestOutputSchema = wfsRequestOutputSchema;
export const gpfWfsGetFeatureByIdRequestOutputSchema = wfsRequestOutputSchema;

// --- `gpf_wfs_get_features` ---

export const gpfWfsGetFeaturesInputSchema = z.object({
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
    .enum(["results", "hits", "request"])
    .default("results")
    .describe("`results` renvoie une FeatureCollection avec les propriétés attributaires uniquement — **les géométries ne sont pas incluses**, ce mode ne peut donc pas être utilisé directement pour cartographier. `hits` renvoie uniquement le nombre total d'objets correspondant à la requête. `request` renvoie l'URL WFS compilée (`get_url`) à destination de `create_map` via `geojson_url`, ou pour déboguer la requête générée. **La géométrie est automatiquement ajoutée aux propriétés du `select`** pour garantir l'affichage cartographique."),
  select: z
    .array(z.string().trim().min(1))
    .min(1)
    .optional()
    .describe("Liste des propriétés non géométriques à renvoyer pour chaque objet. Utiliser `gpf_wfs_describe_type` pour connaître les noms exacts disponibles. Exemple : `[\"code_insee\", \"nom_officiel\"]`."),
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
  spatial_filter: spatialFilterSchema
    .optional()
    .describe("Filtre spatial optionnel. Variantes supportees : `{ type: \"bbox\", bbox: { west, south, east, north } }`, `{ type: \"intersects_point\", point: { lon, lat } }`, `{ type: \"dwithin_point\", point: { lon, lat }, distance_m }`, `{ type: \"intersects_feature\", feature_ref: { typename, feature_id } }`."),
}).strict();

// --- `gpf_wfs_get_features` Types ---

export type GpfWfsGetFeaturesInput = Omit<z.infer<typeof gpfWfsGetFeaturesInputSchema>, "spatial_filter"> & {
  spatial_filter?: SpatialFilter;
};
export type WhereClause = NonNullable<GpfWfsGetFeaturesInput["where"]>[number];
export type OrderByClause = NonNullable<GpfWfsGetFeaturesInput["order_by"]>[number];

// --- `gpf_wfs_get_features` Outputs ---

export const gpfWfsGetFeaturesHitsOutputSchema = z.object({
  result_type: z.literal("hits").describe("Indique que la réponse contient uniquement un comptage."),
  totalFeatures: z.number().describe("Le nombre total d'objets correspondant à la requête."),
});

// --- `gpf_wfs_get_features` Published Schema ---

export const gpfWfsGetFeaturesPublishedInputSchema = generatePublishedInputSchema(gpfWfsGetFeaturesInputSchema);

// --- `gpf_wfs_get_feature_by_id` ---

export const gpfWfsGetFeatureByIdInputSchema = z.object({
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
    .enum(["results", "request"])
    .default("results")
    .describe("`results` renvoie une FeatureCollection normalisée avec exactement un objet. `request` renvoie la requête WFS compilée (`get_url`) à destination de `create_map` via `geojson_url`, ou pour déboguer."),
  select: z
    .array(z.string().trim().min(1))
    .min(1)
    .optional()
    .describe("Liste des propriétés non géométriques à renvoyer. Quand `result_type=\"request\"`, la géométrie est automatiquement ajoutée."),
}).strict();

// --- `gpf_wfs_get_feature_by_id` Types ---

export type GpfWfsGetFeatureByIdInput = z.infer<typeof gpfWfsGetFeatureByIdInputSchema>;

// --- `gpf_wfs_get_feature_by_id` Published Schema ---

export const gpfWfsGetFeatureByIdPublishedInputSchema = generatePublishedInputSchema(gpfWfsGetFeatureByIdInputSchema);
