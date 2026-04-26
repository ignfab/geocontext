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
        typeNames: "(ADMINEXPRESS-COG.LATEST:commune)(ADMINEXPRESS-COG.LATEST:departement)",
        outputFormat: "application/json",
        exceptions: "application/json",
        srsName: "EPSG:4326",
      },
    });
    expect(request.body).toContain("cql_filter=");

    const bodyParams = new URLSearchParams(request.body);
    expect(bodyParams.get("cql_filter")).toEqual(
      "INTERSECTS(geometrie,SRID=4326;POINT(2.35 48.85));INTERSECTS(geometrie,SRID=4326;POINT(2.35 48.85))",
    );

    expect(request.get_url).toContain("typeNames=%28ADMINEXPRESS-COG.LATEST%3Acommune%29%28ADMINEXPRESS-COG.LATEST%3Adepartement%29");
    expect(request.get_url).toContain("srsName=EPSG%3A4326");
    expect(request.get_url).toContain("cql_filter=INTERSECTS%28geometrie%2CSRID%3D4326%3BPOINT%282.35+48.85%29%29%3BINTERSECTS%28geometrie%2CSRID%3D4326%3BPOINT%282.35+48.85%29%29");
  });

  it("should build a multi-typename request without body when cql_filter is absent", () => {
    const request = buildMultiTypenameRequest({
      typenames: ["ADMINEXPRESS-COG.LATEST:region"],
    });

    expect(request.body).toEqual("");
    expect(request.get_url).toContain("typeNames=%28ADMINEXPRESS-COG.LATEST%3Aregion%29");
    expect(request.get_url).not.toContain("cql_filter=");
  });

  it("should build a multi-typename request with one explicit filter per typename", () => {
    const request = buildMultiTypenameRequest({
      typenames: [
        "ADMINEXPRESS-COG.LATEST:commune",
        "ADMINEXPRESS-COG.LATEST:departement",
      ],
      cqlFilters: [
        "INTERSECTS(geometrie,SRID=4326;POINT(2.35 48.85))",
        "INTERSECTS(geometrie,SRID=4326;POINT(2.35 48.85)) AND code_insee = '25'",
      ],
    });

    const bodyParams = new URLSearchParams(request.body);
    expect(bodyParams.get("cql_filter")).toEqual(
      "INTERSECTS(geometrie,SRID=4326;POINT(2.35 48.85));INTERSECTS(geometrie,SRID=4326;POINT(2.35 48.85)) AND code_insee = '25'",
    );
  });

  it("should reject cqlFilters length mismatch", () => {
    expect(() => buildMultiTypenameRequest({
      typenames: [
        "ADMINEXPRESS-COG.LATEST:commune",
        "ADMINEXPRESS-COG.LATEST:departement",
      ],
      cqlFilters: [
        "INTERSECTS(geometrie,SRID=4326;POINT(2.35 48.85))",
      ],
    })).toThrow("Le nombre de filtres CQL");
  });

  it("should reject using cqlFilter and cqlFilters together", () => {
    expect(() => buildMultiTypenameRequest({
      typenames: ["ADMINEXPRESS-COG.LATEST:region"],
      cqlFilter: "INTERSECTS(geometrie,SRID=4326;POINT(2.35 48.85))",
      cqlFilters: ["INTERSECTS(geometrie,SRID=4326;POINT(2.35 48.85))"],
    })).toThrow("`cqlFilter` et `cqlFilters`");
  });

  it("should omit get_url when it exceeds the max length", () => {
    const request = buildMultiTypenameRequest({
      typenames: ["ADMINEXPRESS-COG.LATEST:commune"],
      cqlFilter: `code_insee IN (${Array.from({ length: 900 }, (_, i) => `'${i}'`).join(",")})`,
    });

    expect(request.get_url).toBeNull();
  });
});
