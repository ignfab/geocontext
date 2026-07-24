/**
 * MCP tool exposing detailed schema inspection for a single WFS type.
 */

import BaseTool from "./BaseTool.js";
import { z } from "zod";
import type { OgcCollectionSchema, OgcCollectionProperty } from "@ignfab/gpf-schema-store";

import { wfsSchemaStore } from "../wfs/catalog.js";
import { READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS } from "../helpers/toolAnnotations.js";
import logger from "../logger.js";

// --- Schema ---

const gpfDescribeTypeInputSchema = z.object({
  typename: z
    .string()
    .trim()
    .min(1, "le nom du type ne doit pas être vide")
    .describe("Le nom du type à décrire (de la forme `prefixe:nom`)."),
}).strict();

// --- Types ---

type GpfDescribeTypeInput = z.infer<typeof gpfDescribeTypeInputSchema>;

const gpfPropertyEnumSchema = z.object({
  const: z.string().describe("La valeur parmi celles possibles de la propriété."),
  title: z.string().describe("Le titre lisible de cette valeur."),
  description: z.string().optional().describe("La signification de cette valeur."),
})

const gpfPropertySchema = z.object({
  name: z.string().describe("Le nom de la propriété."),
  type: z.enum(['string', 'boolean', 'integer', 'number']).optional().describe("Le type de la propriété."),
  title: z.string().describe("Le titre lisible de la propriété.").optional(),
  description: z.string().describe("La description de la propriété.").optional(),
  oneOf: z.array(gpfPropertyEnumSchema).describe("Les valeurs possibles de la propriété.").optional(),
});

const gpfDescribeTypeOutputSchema = z.object({
  typename: z.string().describe("L'identifiant unique du type GPF."),
  title: z.string().describe("Le titre lisible du type GPF."),
  description: z.string().describe("La description du type GPF."),
  properties: z.array(gpfPropertySchema).describe("La liste des propriétés pouvant être présentes dans ce type GPF."),
  required: z.array(z.string()).describe("La liste des noms de propriétés toujours présentes dans ce type GPF."),
});

// --- Tool ---

class GpfDescribeTypeTool extends BaseTool<GpfDescribeTypeInput> {
  name = "gpf_describe_type";
  title = "Description d’un type GPF";
  annotations = READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS;
  description = [
    "Renvoie le schéma détaillé d'un type GPF à partir de son identifiant (`typename`) : identifiants, description et liste des propriétés.",
    "Utiliser ce tool après `gpf_search_types` pour inspecter les propriétés disponibles avant d'appeler `gpf_get_features`.",
    "La sortie inclut notamment le type des propriétés, leur description, leurs valeurs possibles (`oneOf`) lorsqu'elles existent",
    "**IMPORTANT : Appel fortement recommandé si les noms exacts des propriétés ne sont pas connus : un nom de propriété incorrect provoque une erreur**."
  ].join("\n");
  protected outputSchemaShape = gpfDescribeTypeOutputSchema;

  schema = gpfDescribeTypeInputSchema;

  /**
   * Loads the detailed schema description for one WFS typename.
   *
   * @param input Normalized tool input.
   * @returns The detailed feature type description from the embedded catalog.
   */
  async execute(input: GpfDescribeTypeInput) {
    logger.info(`[tool] execute ${this.name} ...`, {
      input: input
    });

    try {
      const featureType: OgcCollectionSchema = await wfsSchemaStore.getFeatureType(input.typename);
      return {
        typename: input.typename,
        title: featureType.title,
        description: featureType.description,
        properties: Object.entries(featureType.properties as Record<string, OgcCollectionProperty>).map(([name, property]) => ({
          name,
          ...property
        })),
        required: featureType.required,
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(`${message}. Utiliser gpf_search_types pour trouver un type valide.`);
    }
  }
}

export default GpfDescribeTypeTool;
