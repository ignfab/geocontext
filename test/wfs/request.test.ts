import { describe, expect, it } from "vitest";
import { buildMultiTypenameRequest } from "../../src/wfs/request";
import { MAX_CQL_FILTER_BYTES } from "../../src/wfs/spatialCql";

/** Builds a `code_insee IN (...)` filter: under the limit as raw text, but ~1.7x larger once URL-encoded. */
function inFilter(count: number) {
  return `code_insee IN (${Array.from({ length: count }, (_, i) => `'${i}'`).join(",")})`;
}

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

  it("accepts a POST body of exactly MAX_CQL_FILTER_BYTES and rejects one byte more", () => {
    const filterAtLimit = "a".repeat(MAX_CQL_FILTER_BYTES - "cql_filter=".length);
    const request = buildMultiTypenameRequest({
      typenames: ["ADMINEXPRESS-COG.LATEST:commune"],
      cqlFilter: filterAtLimit,
    });
    expect(request.body.length).toBe(MAX_CQL_FILTER_BYTES);

    expect(() => buildMultiTypenameRequest({
      typenames: ["ADMINEXPRESS-COG.LATEST:commune"],
      cqlFilter: `${filterAtLimit}a`,
    })).toThrow(/Le filtre CQL est trop volumineux/);
  });

  it("rejects cqlFilter when its URL-encoded body exceeds MAX_CQL_FILTER_BYTES", () => {
    const hugeFilter = inFilter(200_000);
    expect(Buffer.byteLength(hugeFilter)).toBeLessThan(MAX_CQL_FILTER_BYTES);
    expect(() => buildMultiTypenameRequest({
      typenames: ["ADMINEXPRESS-COG.LATEST:commune"],
      cqlFilter: hugeFilter,
    })).toThrow(/Le filtre CQL est trop volumineux/);
  });

  it("rejects multi-typename cqlFilters when expanded filter exceeds MAX_CQL_FILTER_BYTES", () => {
    const largeFilter = inFilter(100_000);
    expect(() => buildMultiTypenameRequest({
      typenames: ["ADMINEXPRESS-COG.LATEST:commune"],
      cqlFilter: largeFilter,
    })).not.toThrow();
    expect(() => buildMultiTypenameRequest({
      typenames: ["ADMINEXPRESS-COG.LATEST:commune", "ADMINEXPRESS-COG.LATEST:departement"],
      cqlFilters: [largeFilter, largeFilter],
    })).toThrow(/Le filtre CQL est trop volumineux/);
  });
});
