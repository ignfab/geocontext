import { describe, expect, it } from "vitest";
import { intersect } from "@turf/intersect";
import { feature, featureCollection } from "@turf/helpers";
import type { MultiPolygon, Polygon, Position } from "geojson";

import area from "../../src/helpers/area.js";
import { makeIntersectionArea } from "../../src/helpers/intersectionArea.js";

function rectangle(west: number, south: number, east: number, north: number) : Position[] {
  return [[west, south], [east, south], [east, north], [west, north], [west, south]];
}

function wavyRing(centerLon: number, centerLat: number, radius: number, vertices: number, waves: number) : Position[] {
  const positions = Array.from({ length: vertices }, (_, index) => {
    const angle = (Math.PI * 2 * index) / vertices;
    const wavyRadius = radius * (1 + 0.05 * Math.sin(waves * angle));
    return [centerLon + wavyRadius * Math.cos(angle), centerLat + wavyRadius * Math.sin(angle)];
  });
  return [...positions, positions[0]];
}

function polyclipArea(a: Polygon | MultiPolygon, b: Polygon | MultiPolygon) : number {
  const inter = intersect(featureCollection<Polygon | MultiPolygon>([feature(a), feature(b)]));
  return inter == null ? 0 : area(inter.geometry);
}

describe("helpers/intersectionArea", () => {
  const filter: Polygon = { type: "Polygon", coordinates: [rectangle(2, 48, 3, 49)] };

  it("should sum the overlapping polygons of a MultiPolygon, as area does", () => {
    const overlapping: MultiPolygon = {
      type: "MultiPolygon",
      coordinates: [[rectangle(2.2, 48.2, 2.6, 48.6)], [rectangle(2.4, 48.4, 2.8, 48.8)]],
    };
    const intersectionArea = makeIntersectionArea(filter);

    expect(intersectionArea(overlapping)).toEqual(area(overlapping));

    // Shifted across the eastern edge: each polygon is clipped on its own.
    const crossing: MultiPolygon = {
      type: "MultiPolygon",
      coordinates: [[rectangle(2.8, 48.2, 3.2, 48.6)], [rectangle(2.9, 48.4, 3.3, 48.8)]],
    };
    const expected = area({ type: "MultiPolygon", coordinates: [[rectangle(2.8, 48.2, 3, 48.6)], [rectangle(2.9, 48.4, 3, 48.8)]] });
    expect(intersectionArea(crossing)).toBeCloseTo(expected, 3);
  });

  it("should match general polygon clipping on detailed geometries crossing each other", () => {
    const reference: Polygon = { type: "Polygon", coordinates: [wavyRing(2.35, 48.85, 0.3, 5000, 150)] };
    const intersectionArea = makeIntersectionArea(reference);

    for (const [lon, lat] of [[2.65, 48.85], [2.35, 48.55], [2.1, 49.05]]) {
      const geo: Polygon = { type: "Polygon", coordinates: [wavyRing(lon, lat, 0.12, 3000, 90)] };
      const expected = polyclipArea(geo, reference);

      expect(Math.abs(intersectionArea(geo) - expected) / area(geo)).toBeLessThan(1e-9);
    }
  });

  it("should fall back on general polygon clipping for a self-intersecting filter", () => {
    const bowTie: Polygon = {
      type: "Polygon",
      coordinates: [[[2, 48], [3, 49], [3, 48], [2, 49], [2, 48]]],
    };
    const geo: Polygon = { type: "Polygon", coordinates: [rectangle(2.1, 48.1, 2.9, 48.4)] };

    expect(makeIntersectionArea(bowTie)(geo)).toBeCloseTo(polyclipArea(geo, bowTie), 0);
  });
});
