import { z } from "zod";

export const featureRefSchema = z.object({
  typename: z.string().describe("Le `typename` WFS réutilisable pour une requête ultérieure."),
  feature_id: z.string().describe("L'identifiant WFS réutilisable du feature."),
});
