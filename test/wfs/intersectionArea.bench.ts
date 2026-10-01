/**
 * Performance of `intersection_area`, through `transformFeatureCollectionResponse` as for
 * one request, on synthetic geometries reproducing the costly cases met on real data.
 *
 *   npm run bench
 *
 * To compare two revisions: `npm run bench -- --outputJson before.json` on the first one,
 * then `npm run bench -- --compare before.json` on the second one.
 */
import { bench, describe } from "vitest";
import type { Polygon, Position } from "geojson";

import { transformFeatureCollectionResponse } from "../../src/wfs/response.js";

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Closed ring of `vertices` positions around a center, its radius waving `waves` times. */
function ring(lon: number, lat: number, radius: number, vertices: number, waves = 0) : Position[] {
  const positions = Array.from({ length: vertices }, (_, index) => {
    const angle = (Math.PI * 2 * index) / vertices;
    const r = radius * (1 + 0.02 * Math.sin(waves * angle));
    return [lon + r * Math.cos(angle), lat + r * Math.sin(angle)];
  });
  return [...positions, positions[0]];
}

function polygon(...rings: Position[][]) : Polygon {
  return { type: "Polygon", coordinates: rings };
}

// A region with a detailed boundary, like a département (about 60,000 positions in BD TOPO).
const [LON, LAT, RADIUS] = [2.35, 48.85, 0.3];
const regionRing = ring(LON, LAT, RADIUS, 20000, 200);
const region = polygon(regionRing);

/** Position on the region boundary at the given angle. */
function boundary(angle: number) : [number, number] {
  const r = RADIUS * (1 + 0.02 * Math.sin(200 * angle));
  return [LON + r * Math.cos(angle), LAT + r * Math.sin(angle)];
}

const scenarios: Record<string, Polygon[]> = {
  // Vegetation zones inside a département: spread over a disc, well inside the boundary.
  "5000 small polygons inside a detailed region": Array.from({ length: 5000 }, (_, index) => {
    const r = 0.25 * Math.sqrt((index + 0.5) / 5000), angle = index * GOLDEN_ANGLE;
    return polygon(ring(LON + r * Math.cos(angle), LAT + r * Math.sin(angle), 0.001, 12));
  }),
  // Every polygon needs an actual intersection.
  "5000 small polygons across a detailed boundary": Array.from({ length: 5000 }, (_, index) =>
    polygon(ring(...boundary((Math.PI * 2 * index) / 5000), 0.002, 12))),
  // Large polygons with holes across the boundary: both sides are detailed.
  "20 large polygons with holes across a detailed boundary": Array.from({ length: 20 }, (_, index) => {
    const [lon, lat] = boundary((Math.PI * 2 * index) / 20);
    const holes = [-0.03, 0.03].map((offset) => ring(lon + offset, lat + offset, 0.01, 256).reverse());
    return polygon(ring(lon, lat, 0.1, 20000, 100), ...holes);
  }),
  // Départements of a région: pie slices sharing the region boundary, position for position.
  "20 sectors tiling the region, sharing its boundary": Array.from({ length: 20 }, (_, index) => {
    const arc = regionRing.slice(index * 1000, (index + 1) * 1000 + 1);
    return polygon([[LON, LAT], ...arc, [LON, LAT]]);
  }),
};

for (const [name, geometries] of Object.entries(scenarios)) {
  const featureCollection = {
    type: "FeatureCollection",
    features: geometries.map((geometry, index) => ({ id: `feature.${index}`, geometry, properties: {} })),
  };
  describe(name, () => {
    bench("intersection_area", () => {
      transformFeatureCollectionResponse(featureCollection, {
        typename: "BENCH:feature",
        spatial_extras: ["intersection_area"],
        intersects_feature_filter: { typename: "BENCH:region", feature_id: "region.1" },
      }, region);
    });
  });
}
