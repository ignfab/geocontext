import { describe, expect, it } from "vitest";
import { buildMultiTypenameRequest } from "../../src/wfs/request";

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
  });

  it("should build a multi-typename request without body when cql_filter is absent", () => {
    const request = buildMultiTypenameRequest({
      typenames: ["ADMINEXPRESS-COG.LATEST:region"],
    });

    expect(request.body).toEqual("");
    expect(request.query.typeNames).toEqual("(ADMINEXPRESS-COG.LATEST:region)");
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

  it("carries a long cql_filter in the POST body (why the engine executes via POST, not a GET URL)", () => {
    const request = buildMultiTypenameRequest({
      typenames: ["ADMINEXPRESS-COG.LATEST:commune"],
      cqlFilter: `code_insee IN (${Array.from({ length: 900 }, (_, i) => `'${i}'`).join(",")})`,
    });

    // The URL-encoded filter would make an oversized GET URL (>6000 chars); the
    // engine carries it in the POST body instead.
    expect(request.body).toContain("cql_filter=");
    expect(request.body.length).toBeGreaterThan(6000);
  });
});
