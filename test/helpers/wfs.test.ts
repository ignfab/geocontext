import { fetchWfsFeatures } from "../../src/helpers/wfs.js";

describe("Test legacy WFS helper", () => {
  it("should force JSON exceptions on WFS requests", async () => {
    let capturedUrl = "";

    const features = await fetchWfsFeatures(
      ["ADMINEXPRESS-COG.LATEST:commune"],
      "code_insee = '01001'",
      "WFS",
      async (url: string) => {
        capturedUrl = url;
        return {
          features: [
            {
              id: "commune.1",
              properties: { code_insee: "01001" },
            },
          ],
        };
      },
    );

    expect(features).toHaveLength(1);

    const parsed = new URL(capturedUrl);
    expect(parsed.searchParams.get("service")).toEqual("WFS");
    expect(parsed.searchParams.get("request")).toEqual("GetFeature");
    expect(parsed.searchParams.get("typeName")).toEqual("ADMINEXPRESS-COG.LATEST:commune");
    expect(parsed.searchParams.get("outputFormat")).toEqual("application/json");
    expect(parsed.searchParams.get("exceptions")).toEqual("application/json");
    expect(parsed.searchParams.get("cql_filter")).toEqual("code_insee = '01001'");
  });
});
