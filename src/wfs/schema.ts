/**
 * Zod schemas and published MCP input schemas for the structured WFS engine.
 *
 * This module centralizes:
 * - shared schema fragments reused by WFS tools
 * - public tool input schemas and inferred input types
 * - compact output schemas used for HTTP preview responses
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
export const GPF_GET_FEATURES_SPATIAL_FILTER_KEYS = [
  "bbox_filter",
  "intersects_point_filter",
  "dwithin_point_filter",
  "intersects_feature_filter",
  "travel_time_filter",
] as const;

// --- Shared Clauses ---

const whereClauseSchema = z.object({
  property: z.string().trim().min(1).describe("Nom exact d'une propriété non géométrique du type GPF. Utiliser `gpf_describe_type` pour connaître les noms exacts disponibles."),
  operator: z.enum(WHERE_OPERATORS).describe("Opérateur de filtre : `eq`, `ne`, `lt`, `lte`, `gt`, `gte`, `in`, `is_null`."),
  value: z.string().optional().describe("Valeur scalaire sérialisée en texte, utilisée avec tous les opérateurs sauf `in` et `is_null`."),
  values: z.array(z.string()).min(1).optional().describe("Liste de valeurs sérialisées en texte, utilisée uniquement avec `operator = \"in\"`."),
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
  result_type: z.literal("http_post_request").describe("Indique que la réponse contient une requête POST robuste à exécuter par un client HTTP."),
  http_post_request: z.object({
    method: z.literal("POST").describe("Méthode HTTP à utiliser."),
    url: z.string().url().describe("L'URL de la requête."),
    headers: z.object({
      "Content-Type": z.literal("application/x-www-form-urlencoded").describe("Type de contenu du corps POST."),
    }).strict().describe("En-têtes HTTP à envoyer avec la requête POST."),
    body: z.string().describe("Corps de la requête POST, encodé en `application/x-www-form-urlencoded`."),
  }).strict().describe("Requête HTTP POST complète à utiliser pour appeler directement le service pourvoyeur."),
});

const wfsHttpGetUrlOutputSchema = z.object({
  result_type: z.literal("http_get_url").describe("Indique que la réponse contient l'URL GET équivalente."),
  http_get_url: z.string().url().describe("URL GET complète avec tous les paramètres. Utile pour les consommateurs URL-first ou pour la visualisation dans un outil la supportant; pour une exécution HTTP robuste, préférer `http_post_request` car l'URL renvoyée ici peut être trop longue."),
});

export const gpfGetFeaturesHttpPostRequestOutputSchema = wfsHttpPostRequestOutputSchema;
export const gpfGetFeaturesHttpGetUrlOutputSchema = wfsHttpGetUrlOutputSchema;
export const gpfGetFeatureByIdHttpPostRequestOutputSchema = wfsHttpPostRequestOutputSchema;
export const gpfGetFeatureByIdHttpGetUrlOutputSchema = wfsHttpGetUrlOutputSchema;

// --- Shared GPF Inputs ---

const gpfTypenameInputSchema = z.object({
  typename: z
    .string()
    .trim()
    .min(1, "le nom du type ne doit pas être vide")
    .describe("Nom exact du type GPF à interroger, par exemple `BDTOPO_V3:batiment`. Utiliser `gpf_search_types` pour trouver un `typename` valide.")
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
    .describe("Filtre spatial par distance à un point. Exclusif avec les autres filtres spatiaux."),
  intersects_feature_filter: intersectsFeatureFilterSchema
    .optional()
    .describe("Filtre spatial par intersection avec un feature GPF de référence. Exclusif avec les autres filtres spatiaux."),
  travel_time_filter: travelTimeFilterSchema
    .optional()
    .describe("Filtre spatial par temps de trajet depuis un point (`profile` voiture ou piéton). Exclusif avec les autres filtres spatiaux."),
})

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

export type SpatialFilter =
  | ({ operator: "bbox" } & z.infer<typeof bboxFilterSchema>)
  | ({ operator: "intersects_point" } & z.infer<typeof intersectsPointFilterSchema>)
  | ({ operator: "dwithin_point" } & z.infer<typeof dwithinPointFilterSchema>)
  | ({ operator: "intersects_feature" } & z.infer<typeof intersectsFeatureFilterSchema>)
  | ({ operator: "travel_time" } & z.infer<typeof travelTimeFilterSchema>);

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
  result_type: z
    .enum(["results", "http_post_request", "http_get_url"])
    .default("results")
    .describe("`results` renvoie une FeatureCollection avec les propriétés attributaires uniquement — **les géométries ne sont pas incluses**, ce mode ne peut donc pas être utilisé directement pour cartographier. `http_post_request` renvoie une requête POST robuste à exécuter directement. `http_get_url` renvoie l'URL GET équivalente, utile pour les consommateurs URL-first ou pour la visualisation dans un outil la supportant. Avec `http_post_request` ou `http_get_url`, la géométrie est automatiquement ajoutée aux propriétés du `select` pour garantir l'affichage cartographique."),
  order_by: z
    .array(orderBySchema)
    .min(1)
    .optional()
    .describe("Liste ordonnée des critères de tri."),
}))
  .strict();

export const gpfGetFeaturesInputSchema = gpfGetFeaturesInputObjectSchema.superRefine(assertSpatialFilterExclusion);

// --- `gpf_get_features` Types ---

export type GpfGetFeaturesInput = z.infer<typeof gpfGetFeaturesInputSchema>;

// --- `gpf_get_features` Published Schema ---

export const gpfGetFeaturesPublishedInputSchema = generatePublishedInputSchema(gpfGetFeaturesInputObjectSchema);

// --- `gpf_count_features`

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

export type GpfGetOrCountFeaturesInput = GpfGetFeaturesInput | GpfCountFeaturesInput

// --- `gpf_get_feature_by_id` ---

export const gpfGetFeatureByIdInputSchema = z.object({
  typename: z
    .string()
    .trim()
    .min(1, "le nom du type ne doit pas être vide")
    .describe("Nom exact du type GPF à interroger, par exemple `ADMINEXPRESS-COG.LATEST:commune`."),
  // The description is not exactly the same as in gpfTypenameInputSchema because the
  // MCP should only call getFeatureById using a previously-obtained feature_ref.
  feature_id: z
    .string()
    .trim()
    .min(1, "le feature_id ne doit pas être vide")
    .describe("Identifiant GPF exact de l'objet à récupérer, par exemple `commune.8952`."),
  result_type: z
    .enum(["results", "http_post_request", "http_get_url"])
    .default("results")
    .describe("`results` renvoie une FeatureCollection normalisée avec exactement un objet. `http_post_request` renvoie une requête POST robuste à exécuter directement. `http_get_url` renvoie l'URL GET équivalente, utile pour les consommateurs URL-first ou pour la visualisation dans un outil la supportant."),
  select: z
    .array(z.string().trim().min(1))
    .min(1)
    .optional()
    .describe("Liste des propriétés non géométriques à renvoyer. Quand `result_type=\"http_post_request\"` ou `result_type=\"http_get_url\"`, la géométrie est automatiquement ajoutée."),
}).strict();

// --- `gpf_get_feature_by_id` Types ---

export type GpfGetFeatureByIdInput = z.infer<typeof gpfGetFeatureByIdInputSchema>;

// --- `gpf_get_feature_by_id` Published Schema ---

export const gpfGetFeatureByIdPublishedInputSchema = generatePublishedInputSchema(gpfGetFeatureByIdInputSchema);
