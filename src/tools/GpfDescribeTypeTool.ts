/**
 * MCP tool exposing detailed schema inspection for a single WFS type.
 */

import BaseTool from "./BaseTool.js";
import { z } from "zod";
import type { OgcCollectionSchema } from "@ignfab/gpf-schema-store";

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

const gpfPropertySchema = z.object({
  name: z.string().describe("Le nom de la propriété."),
  type: z.string().describe("Le type de la propriété."),
  title: z.string().describe("Le titre lisible de la propriété.").optional(),
  description: z.string().describe("La description de la propriété.").optional(),
  enum: z.array(z.string()).describe("Les valeurs possibles de la propriété.").optional(),
  defaultCrs: z.string().describe("Le système de coordonnées par défaut si la propriété est géométrique.").optional(),
});

const gpfDescribeTypeOutputSchema = z.object({
  id: z.string().describe("L'identifiant complet du type GPF."),
  namespace: z.string().describe("L'espace de nommage du type GPF."),
  name: z.string().describe("Le nom court du type GPF."),
  title: z.string().describe("Le titre lisible du type GPF."),
  description: z.string().describe("La description du type GPF."),
  properties: z.array(gpfPropertySchema).describe("La liste des propriétés du type GPF."),
});

// --- Tool ---

class GpfDescribeTypeTool extends BaseTool<GpfDescribeTypeInput> {
  name = "gpf_describe_type";
  title = "Description d’un type GPF";
  annotations = READ_ONLY_OPEN_WORLD_TOOL_ANNOTATIONS;
  description = [
    "Renvoie le schéma détaillé d'un type GPF à partir de son identifiant (`typename`) : identifiants, description et liste des propriétés.",
    "Utiliser ce tool après `gpf_search_types` pour inspecter les propriétés disponibles avant d'appeler `gpf_get_features`.",
    "La sortie inclut notamment le type des propriétés, leur description, leurs valeurs possibles (`enum`) lorsqu'elles existent",
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
      return featureType;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(`${message}. Utiliser gpf_search_types pour trouver un type valide.`);
    }
  }
}

export default GpfDescribeTypeTool;
