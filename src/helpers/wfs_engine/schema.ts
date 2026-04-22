import { z } from "zod";

import { generatePublishedInputSchema } from "../jsonSchema.js";
import { lonSchema, latSchema } from "../schemas.js";

export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 5000;
export const REQUEST_GET_URL_MAX_LENGTH = 6000;
export const WHERE_OPERATORS = ["eq", "ne", "lt", "lte", "gt", "gte", "in", "is_null"] as const;
export const SPATIAL_OPERATORS = ["bbox", "intersects_point", "dwithin_point", "intersects_feature"] as const;
export const ORDER_DIRECTIONS = ["asc", "desc"] as const;

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
  spatial_operator: z
    .enum(SPATIAL_OPERATORS)
    .optional()
    .describe("Type optionnel de filtre spatial."),
  bbox_west: lonSchema.describe("Longitude ouest en WGS84 `lon/lat`, utilisée avec `spatial_operator = \"bbox\"`.").optional(),
  bbox_south: latSchema.describe("Latitude sud en WGS84 `lon/lat`, utilisée avec `spatial_operator = \"bbox\"`.").optional(),
  bbox_east: lonSchema.describe("Longitude est en WGS84 `lon/lat`, utilisée avec `spatial_operator = \"bbox\"`.").optional(),
  bbox_north: latSchema.describe("Latitude nord en WGS84 `lon/lat`, utilisée avec `spatial_operator = \"bbox\"`.").optional(),
  intersects_lon: lonSchema.describe("Longitude du point en WGS84 `lon/lat`, utilisée avec `spatial_operator = \"intersects_point\"`.").optional(),
  intersects_lat: latSchema.describe("Latitude du point en WGS84 `lon/lat`, utilisée avec `spatial_operator = \"intersects_point\"`.").optional(),
  dwithin_lon: lonSchema.describe("Longitude du point en WGS84 `lon/lat`, utilisée avec `spatial_operator = \"dwithin_point\"`.").optional(),
  dwithin_lat: latSchema.describe("Latitude du point en WGS84 `lon/lat`, utilisée avec `spatial_operator = \"dwithin_point\"`.").optional(),
  dwithin_distance_m: z.number().finite().positive().describe("Distance en mètres, utilisée avec `spatial_operator = \"dwithin_point\"`.").optional(),
  intersects_feature_typename: z.string().trim().min(1).optional().describe("Type WFS du feature de référence, utilisé avec `spatial_operator = \"intersects_feature\"`."),
  intersects_feature_id: z.string().trim().min(1).optional().describe("Identifiant du feature de référence, utilisé avec `spatial_operator = \"intersects_feature\"`."),
}).strict();

export type GpfWfsGetFeaturesInput = z.infer<typeof gpfWfsGetFeaturesInputSchema>;
export type WhereClause = NonNullable<GpfWfsGetFeaturesInput["where"]>[number];
export type OrderByClause = NonNullable<GpfWfsGetFeaturesInput["order_by"]>[number];

export type SpatialFilter =
  | { operator: "bbox"; west: number; south: number; east: number; north: number }
  | { operator: "intersects_point"; lon: number; lat: number }
  | { operator: "dwithin_point"; lon: number; lat: number; distance_m: number }
  | { operator: "intersects_feature"; typename: string; feature_id: string };

export const gpfWfsGetFeaturesHitsOutputSchema = z.object({
  result_type: z.literal("hits").describe("Indique que la réponse contient uniquement un comptage."),
  totalFeatures: z.number().describe("Le nombre total d'objets correspondant à la requête."),
});

export const gpfWfsGetFeaturesRequestOutputSchema = z.object({
  result_type: z.literal("request").describe("Indique que la réponse contient la requête WFS compilée (équivalent enrichi géométrie pour `create_map` et le débogage)."),
  method: z.literal("POST").describe("Méthode HTTP réellement utilisée pour exécuter la requête."),
  url: z.string().describe("URL de base appelée pour la requête POST."),
  query: z.record(z.string()).describe("Paramètres WFS envoyés dans la query string."),
  body: z.string().describe("Corps de la requête POST, encodé en `application/x-www-form-urlencoded`."),
  get_url: z.string().nullable().optional().describe("URL GET dérivée quand la requête reste raisonnablement portable en GET."),
});

type PublishedInputSchema = {
  type: "object";
  properties?: Record<string, object>;
  required?: string[];
};

export const gpfWfsGetFeaturesPublishedInputSchema = generatePublishedInputSchema(gpfWfsGetFeaturesInputSchema) as PublishedInputSchema;
