/**
 * MCP tool exposing detailed schema inspection for a single WFS type.
 */

import BaseTool from "./BaseTool.js";
import { z } from "zod";
import type { OgcCollectionSchema } from "@ignfab/gpf-schema-store";
import { zOgcCollectionSchema } from "@ignfab/gpf-schema-store";

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

// FIXME: when mcp-framework is removed, remove this patch which is only here
// because mcp-framework does not accept z.record field types.
const gpfDescribeTypeOutput = zOgcCollectionSchema
  .omit({ properties: true })
  .catchall(z.unknown());


// --- Types ---

type GpfDescribeTypeInput = z.infer<typeof gpfDescribeTypeInputSchema>;

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
  protected outputSchemaShape = gpfDescribeTypeOutput;

  schema = gpfDescribeTypeInputSchema;

  /**
   * Loads the detailed schema description for one GPF typename.
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
