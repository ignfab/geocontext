import { z } from "zod";

export const lonSchema = z
  .number()
  .finite()
  .min(-180)
  .max(180)
  .describe("La longitude du point.");

export const latSchema = z
  .number()
  .finite()
  .min(-90)
  .max(90)
  .describe("La latitude du point.");

export const featureRefSchema = z.object({
  typename: z.string().describe("Le `typename` GPF réutilisable pour une requête ultérieure."),
  feature_id: z.string().describe("L'identifiant GPF réutilisable du feature."),
});
