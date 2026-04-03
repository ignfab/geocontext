import { MCPTool } from "mcp-framework";
import { z } from "zod";
import type { Collection } from "@ignfab/gpf-schema-store";
import { wfsClient } from "../gpf/wfs.js";

const gpfWfsPropertySchema = z.object({
  name: z.string().describe("Le nom de la propriété."),
  type: z.string().describe("Le type de la propriété."),
  title: z.string().describe("Le titre lisible de la propriété.").optional(),
  description: z.string().describe("La description de la propriété.").optional(),
  enum: z.array(z.string()).describe("Les valeurs possibles de la propriété.").optional(),
  defaultCrs: z.string().describe("Le système de coordonnées par défaut si la propriété est géométrique.").optional(),
});

const gpfWfsDescribeTypeOutputSchema = z.object({
  result: z.object({
    id: z.string().describe("L'identifiant complet du type WFS."),
    namespace: z.string().describe("L'espace de nommage du type WFS."),
    name: z.string().describe("Le nom court du type WFS."),
    title: z.string().describe("Le titre lisible du type WFS."),
    description: z.string().describe("La description du type WFS."),
    properties: z.array(gpfWfsPropertySchema).describe("La liste des propriétés du type WFS."),
  }).describe("La description détaillée du type WFS."),
});

interface GpfWfsDescribeTypeInput {
  typename: string;
}

class GpfWfsDescribeTypeTool extends MCPTool<GpfWfsDescribeTypeInput> {
  name = "gpf_wfs_describe_type";
  title = "Description d’un type WFS";
  description = [
    "Renvoie le schéma détaillé d'un type WFS à partir de son identifiant (`typename`) : identifiants, description et liste des propriétés.",
    "Utiliser ce tool après `gpf_wfs_search_types` pour inspecter les propriétés disponibles avant d'appeler `gpf_wfs_get_features`.",
    "La sortie inclut notamment le type des propriétés, leur description, et leurs valeurs possibles (`enum`) lorsqu'elles existent.",
  ].join("\r\n");
  protected outputSchemaShape = gpfWfsDescribeTypeOutputSchema;

  schema = z.object({
    typename: z
      .string()
      .trim()
      .min(1, "le nom du type ne doit pas être vide")
      .describe("Le nom du type (ex : BDTOPO_V3:batiment)"),
  });

  async execute(input: GpfWfsDescribeTypeInput) {
    try {
      const featureType: Collection = await wfsClient.getFeatureType(input.typename);
      return {
        result: featureType,
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(`${message}. Utiliser gpf_wfs_search_types pour trouver un type valide.`);
    }
  }

  protected createSuccessResponse(data: unknown) {
    if (
      typeof data === "object" &&
      data !== null &&
      "result" in data &&
      typeof data.result === "object" &&
      data.result !== null
    ) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data.result),
          },
        ],
      };
    }

    return super.createSuccessResponse(data);
  }
}

export default GpfWfsDescribeTypeTool;
