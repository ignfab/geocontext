import { describe, expect, it, vi } from "vitest";

import type { GpfFeatureType } from "../../src/wfs/catalog.js";
import type { CompiledRequest } from "../../src/wfs/request.js";
import {
  resolveFeatureGeometry,
  type ReferenceGeometryClient,
} from "../../src/wfs/referenceGeometry.js";

const geometry = { type: "Point", coordinates: [2, 48] } as const;

function featureType(typename: string): GpfFeatureType {
  return {
    typename,
    schema: { properties: { geom: { format: "geometry-point" }, nom: { type: "string" } } },
  } as unknown as GpfFeatureType;
}

function makeClient(knownTypenames: string[]) {
  const getFeatureType = vi.fn(async (typename: string) => {
    if (!knownTypenames.includes(typename)) {
      throw new Error(`unknown ${typename}`);
    }
    return featureType(typename);
  });
  const fetchFeatureCollection = vi.fn(async (_request: CompiledRequest) => ({
    type: "FeatureCollection",
    features: [{ type: "Feature", id: "commune.1", geometry, properties: {} }],
  }));
  const client = { getFeatureType, fetchFeatureCollection } as unknown as ReferenceGeometryClient;
  return { client, getFeatureType, fetchFeatureCollection };
}

const ref = (typename: string) => ({ typename, feature_id: "commune.1" });

describe("resolveFeatureGeometry", () => {
  it.each([
    "ADMINEXPRESS-COG.2025:commune",
    "ADMINEXPRESS-COG.2026:commune",
    "ADMINEXPRESS-COG.LATEST:commune",
    "ADMINEXPRESS-COG.2024:commune",
    "BDTOPO_V3:batiment",
  ])("queries the requested typename %s directly without automatic remapping", async (typename) => {
    const { client, getFeatureType, fetchFeatureCollection } = makeClient([typename]);

    await expect(resolveFeatureGeometry(client, ref(typename))).resolves.toEqual(geometry);

    expect(getFeatureType).toHaveBeenCalledTimes(1);
    expect(getFeatureType).toHaveBeenCalledWith(typename);
    expect(fetchFeatureCollection.mock.calls[0][0].query.typeNames).toBe(typename);
  });
});
