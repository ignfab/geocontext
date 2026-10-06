import { z } from "zod";

export const lonSchema = z
  .number()
  .finite()
  .min(-180)
  .max(180);

export const latSchema = z
  .number()
  .finite()
  .min(-90)
  .max(90);

export function buildLonLatSchema(suffix?: string) {
  const extra = suffix ? ` ${suffix}` : "";
  const schema = z.object({
    lon: lonSchema.describe(`Longitude du point${extra} en WGS84.`),
    lat: latSchema.describe(`Latitude du point${extra} en WGS84.`),
  }).strict();
  return suffix ? schema.describe(`Le point${extra}.`) : schema;
}

export const featureRefSchema = z.object({
  typename: z.string().describe("Le `typename` GPF réutilisable pour une requête ultérieure."),
  feature_id: z.string().describe("L'identifiant GPF réutilisable du feature."),
});
