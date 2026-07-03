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
import { featureRefSchema, lonSchema, latSchema } from "../helpers/schemas.js";
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
  "travel_time_filter"
] as const;
export const GPF_SPATIAL_FILTER_DOCNAMES = GPF_GET_FEATURES_SPATIAL_FILTER_KEYS
  .map((name) => `\`${name}\``)
  .join(", ")
  .replace(/, ([^,]*)$/, ' ou $1')

export const GPF_GET_FEATURES_SPATIAL_EXTRAS = [
  "centroid",
  "bbox"
] as const;
export const GPF_SPATIAL_EXTRAS_DOCNAMES = GPF_GET_FEATURES_SPATIAL_EXTRAS
  .map((name) => `\`${name}\``)
  .join(", ")
  .replace(/, ([^,]*)$/, ' et $1')

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

const gpfGeometryExtraInputSchema = z.object({
  spatial_extras: z
    .array(z.enum(GPF_GET_FEATURES_SPATIAL_EXTRAS))
    .default([])
    .transform((val) => [...new Set(val)])
    .describe(`Éléments calculés depuis la géométrie à renvoyer pour \`result_type=results\`. Peut inclure ${GPF_SPATIAL_EXTRAS_DOCNAMES}, aucun par défaut.`),
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

// --- Shared GPF outputs ---

const featureResultSchema = z
  .object({
    type: z.literal("Feature").describe("Le type GeoJSON."),
    id: z.string().describe("L'identifiant de l'objet."),
    feature_ref: featureRefSchema.describe("Référence GPF réutilisable, notamment avec `gpf_get_features` et `intersects_feature_filter`."),
    properties: z.object({}).catchall(z.unknown()).describe("Les attributs de l'objet."), // in the catchall
    geometry: z.null().describe("La géométrie de l'objet, non incluse. Celle-ci est accessible au lien `collection_url`."),
  })
  .catchall(z.unknown());

const featureCollectionCommonSchema = z.object({
  type: z.literal("FeatureCollection").describe("Le type GeoJSON."),
  totalFeatures: z.number().describe("Le nombre de résultats correspondant à la requête sur le serveur."),
  numberMatched: z.number().describe("Le nombre de résultats correspondant à la requête sur le serveur."), // FIXME: put the right definition
  numberReturned: z.number().describe("Le nombre de résultats renvoyés, au maximum `limit`"),
  timeStamp: z.date().describe("La date et l'heure de la requête."),
  collection_url: z.string().url().describe("Le lien vers le GeoJSON qui inclut les géométries."),
});

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
    .describe("Liste des attributs (à l'exception de la géométrie) à renvoyer pour chaque objet. Utiliser `gpf_describe_type` pour connaître les noms exacts disponibles. Exemple : `[\"code_insee\", \"nom_officiel\"]`."),
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
  .merge(gpfGeometryExtraInputSchema)
  .strict();

export const gpfGetFeaturesInputSchema = gpfGetFeaturesInputObjectSchema
  .superRefine(assertSpatialFilterExclusion)

export const getFeaturesOutputSchema = featureCollectionCommonSchema
  .merge(z.object({
    features: z.array(featureResultSchema).describe("La liste des objets correspondant à la requête."),
  })
);

// --- `gpf_get_features` Types ---

export type GpfGetFeaturesInput = z.infer<typeof gpfGetFeaturesInputSchema>;

// --- `gpf_get_features` Published Schema ---

export const gpfGetFeaturesPublishedInputSchema = generatePublishedInputSchema(gpfGetFeaturesInputObjectSchema);

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

// --- `gpf_get_feature_by_id` ---

export const gpfGetFeatureByIdInputObjectSchema = z.object({
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
  select: z
    .array(z.string().trim().min(1))
    .min(1)
    .optional()
    .describe("Liste des attributs (à l'exception de la géométrie) à renvoyer.  Utiliser `gpf_wfs_describe_type` pour connaître les noms exacts disponibles. Exemple : `[\"code_insee\", \"nom_officiel\"]`."),
})
  .merge(gpfGeometryExtraInputSchema)
  .strict();

export const gpfGetFeatureByIdInputSchema = gpfGetFeatureByIdInputObjectSchema;

export const getFeatureByIdOutputSchema = featureCollectionCommonSchema
  .merge(z.object({
    features: z.array(featureResultSchema).max(1).describe("La liste avec l'objet exact de la requête."),
  })
);

// --- `gpf_get_feature_by_id` Types ---

export type GpfGetFeatureByIdInput = z.infer<typeof gpfGetFeatureByIdInputSchema>;

// --- `gpf_get_feature_by_id` Published Schema ---

export const gpfGetFeatureByIdPublishedInputSchema = generatePublishedInputSchema(gpfGetFeatureByIdInputObjectSchema);
