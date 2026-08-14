/**
 * MCP tool exposing focused schema details for selected properties of one GPF type.
 */

import BaseTool from "./BaseTool.js";
import { z } from "zod";

import type { OgcCollectionProperty, OgcCollectionPropertyEnumValue, OgcCollectionSchema } from "@ignfab/gpf-schema-store";
import { wfsSchemaStore } from "../wfs/catalog.js";
import type { GpfFeatureType } from "../wfs/catalog.js";
import { READ_ONLY_CLOSED_WORLD_TOOL_ANNOTATIONS } from "../helpers/toolAnnotations.js";
import logger from "../logger.js";

// --- Schema ---

const gpfDescribeTypeDetailsInputSchema = z.object({
  typename: z
    .string()
    .trim()
    .min(1, "le nom du type ne doit pas être vide")
    .describe("Le nom du type à décrire (de la forme `prefixe:nom`)."),
  select: z
    .array(z.string().trim())
    .min(1, "il faut choisir au moins une propriété")
    .describe("La liste des propriétés non géométriques sur lesquelles des détails sont requis."),
  extra_details: z
    .boolean()
    .default(false)
    .describe("Si demandé, renvoie la totalité du schéma de référence pour les propriétés demandées (cela peut être volumineux). Sinon, ne renvoie que le nom, le type et la description des propriétés, ainsi que la liste des valeurs possibles (`oneOf`) lorsqu'elle existe et la description de ces valeurs.")
}).strict();

const gpfPropertyEnumSchema = z.object({
  const: z.string().describe("La valeur possible."),
  description: z.string().optional().describe("La signification de cette valeur."),
}).catchall(z.unknown()); // catchall for when extra_details is required

const gpfPropertyDetailsSchema = z.object({
  name: z.string().describe("Le nom de la propriété."),
  description: z.string().optional().describe("La description de la propriété."),
  type: z.string().optional().describe("Le type de la propriété."),
  required: z.boolean().describe("Indique si la propriété est obligatoirement présente pour tous les objets du type."),
  oneOf: z.array(gpfPropertyEnumSchema).optional().describe("La liste des valeurs possibles, si elle existe."),
  extra_detail_fields: z.array(z.string()).optional().describe("La liste des champs supplémentaires disponibles pour cette propriété (ou pour ses valeurs `oneOf`). Ces champs peuvent être demandés via `extra_details`."),
}).catchall(z.unknown()); // catchall for when extra_details is required

const gpfDescribeTypeDetailsOutput = z.object({
  typename: z.string().describe("L'identifiant du type."),
  properties: z.array(gpfPropertyDetailsSchema).describe("La liste des propriétés non géométriques demandées avec leurs détails."),
});

// --- Types ---

type GpfDescribeTypeDetailsInput = z.infer<typeof gpfDescribeTypeDetailsInputSchema>;
type GpfDescribePropertyDetailsOutput = z.infer<typeof gpfPropertyDetailsSchema>;
type GpfDescribePropertyEnumOutput = z.infer<typeof gpfPropertyEnumSchema>;

// --- Utility ---

/**
 * Lists keys present on a schema fragment but not exposed in the short output.
 */
function getExtraKeys(source: Record<string, unknown>, knownKeys: readonly string[]) {
  return Object.keys(source).filter((key) => !knownKeys.includes(key));
}

/**
 * Normalizes oneOf values into the tool output shape.
 */
function extractOneOfDetails(oneOf: OgcCollectionPropertyEnumValue[] | undefined): GpfDescribePropertyEnumOutput[] | undefined {
  if (!oneOf) {
    return undefined;
  }

  return oneOf.map((value: OgcCollectionPropertyEnumValue) => ({
    const: value.const,
    description: value.description,
  }));
}

/**
 * Lists extra field names available on oneOf values.
 */
function getOneOfExtraDetailFields(oneOf: OgcCollectionPropertyEnumValue[] | undefined) {
  if (!oneOf) {
    return [];
  }

  return Array.from(
    new Set(
      oneOf.flatMap((value: OgcCollectionPropertyEnumValue) =>
        getExtraKeys(value as Record<string, unknown>, ["const", "title", "description"]),
      ),
    ),
  );
}

/**
 * Extracts selected details for one non-geometry property.
 */
function extractDetails(name: string, schema: OgcCollectionSchema, extraDetails: boolean) : GpfDescribePropertyDetailsOutput {
  const prop: OgcCollectionProperty = schema.properties[name];
  const required = schema.required.includes(name);

  if (extraDetails) { // return the full schema for the property
    return {
      ...prop,
      name,
      required,
    };
  }

  const oneOf = extractOneOfDetails(prop.oneOf);

  const propertyExtraDetailFields = getExtraKeys(
    prop as Record<string, unknown>,
    ["type", "title", "description", "format", "oneOf", "x-ogc-role"],
  );
  const oneOfExtraDetailFields = getOneOfExtraDetailFields(prop.oneOf);
  const extra_detail_fields = Array.from(new Set([...propertyExtraDetailFields, ...oneOfExtraDetailFields]));

  return {
    name,
    description: prop.description,
    type: prop.type,
    required,
    oneOf,
    extra_detail_fields,
  };
}

// --- Tool ---

class GpfDescribeTypeDetailsTool extends BaseTool<GpfDescribeTypeDetailsInput> {
  name = "gpf_describe_type_details";
  title = "Description des propriétés d’un type GPF";
  annotations = READ_ONLY_CLOSED_WORLD_TOOL_ANNOTATIONS;
  description = [
    "Renvoie la description complète, le type et la liste des descriptions des valeurs possibles (`oneOf`) de propriétés choisies d'un type GPF.",
    "Nécessite la liste de propriétés à renvoyer : les noms des propriétés doivent être obtenus par un appel préalable à `gpf_describe_type`.",
    "Si certaines propriétés disposent de plus de renseignements dans le schéma du type, une indication `extra_detail_fields` mentionne ces champs supplémentaires (y compris ceux des valeurs `oneOf`). Ceux-ci peuvent être demandés avec l'option `extra_details`."
  ].join("\n");
  protected outputSchemaShape = gpfDescribeTypeDetailsOutput;

  schema = gpfDescribeTypeDetailsInputSchema;

  /**
   * Formats the details payload into both text content and structuredContent.
   *
   * @param data Raw execution result.
   * @returns An MCP success response with validated output shape.
   */
  protected createSuccessResponse(data: unknown) {
    const payload = gpfDescribeTypeDetailsOutput.parse(data);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(payload) }],
      structuredContent: payload,
    };
  }

  /**
   * Loads the detailed schema description for one GPF typename.
   *
   * @param input Normalized tool input.
   * @returns The detailed feature type description from the embedded catalog.
   */
  async execute(input: GpfDescribeTypeDetailsInput) {
    logger.info(`[tool] execute ${this.name} ...`, {
      input: input
    });

    let featureType: GpfFeatureType;

    try {
      featureType = await wfsSchemaStore.getFeatureType(input.typename);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(`${message}. Utiliser gpf_search_types pour trouver un type valide.`);
    }

    const invalidProperties = input.select.filter((name: string) => {
      const property = featureType.schema.properties[name];
      return !property || !property.type;
    });
    if (invalidProperties.length > 0) {
      throw new Error(`Le type ${featureType.typename} n'admet pas, parmi ses propriétés non-géométriques : ${invalidProperties.join(", ")}. Utiliser gpf_describe_type pour obtenir la liste des propriétés non-géométriques disponibles.`);
    }

    return {
      typename: featureType.typename,
      properties: input.select.map((name: string) => extractDetails(name, featureType.schema, input.extra_details)),
    };
  }
}

export default GpfDescribeTypeDetailsTool;
