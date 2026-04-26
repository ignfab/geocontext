import { buildMultiTypenameRequest } from "../../../src/helpers/wfs_engine/request";

describe("wfs_engine/request", () => {
  it("should build a multi-typename request with encoded cql_filter", () => {
    const request = buildMultiTypenameRequest({
      typenames: [
        "ADMINEXPRESS-COG.LATEST:commune",
        "ADMINEXPRESS-COG.LATEST:departement",
      ],
      cqlFilter: "INTERSECTS(geometrie,SRID=4326;POINT(2.35 48.85))",
    });

    expect(request).toMatchObject({
      method: "POST",
      url: "https://data.geopf.fr/wfs",
      query: {
        service: "WFS",
        version: "2.0.0",
        request: "GetFeature",
        typeNames: "ADMINEXPRESS-COG.LATEST:commune,ADMINEXPRESS-COG.LATEST:departement",
        outputFormat: "application/json",
        exceptions: "application/json",
      },
    });
    expect(request.body).toContain("cql_filter=");

    const bodyParams = new URLSearchParams(request.body);
    expect(bodyParams.get("cql_filter")).toEqual(
      "INTERSECTS(geometrie,SRID=4326;POINT(2.35 48.85))",
    );

    expect(request.get_url).toContain("typeNames=ADMINEXPRESS-COG.LATEST%3Acommune%2CADMINEXPRESS-COG.LATEST%3Adepartement");
    expect(request.get_url).toContain("cql_filter=INTERSECTS%28geometrie%2CSRID%3D4326%3BPOINT%282.35+48.85%29%29");
  });

  it("should build a multi-typename request without body when cql_filter is absent", () => {
    const request = buildMultiTypenameRequest({
      typenames: ["ADMINEXPRESS-COG.LATEST:region"],
    });

    expect(request.body).toEqual("");
    expect(request.get_url).toContain("typeNames=ADMINEXPRESS-COG.LATEST%3Aregion");
    expect(request.get_url).not.toContain("cql_filter=");
  });

  it("should omit get_url when it exceeds the max length", () => {
    const request = buildMultiTypenameRequest({
      typenames: ["ADMINEXPRESS-COG.LATEST:commune"],
      cqlFilter: `code_insee IN (${Array.from({ length: 900 }, (_, i) => `'${i}'`).join(",")})`,
    });

    expect(request.get_url).toBeNull();
  });
});

