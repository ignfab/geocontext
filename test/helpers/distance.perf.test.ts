import { describe, expect, it } from "vitest";
import type { Geometry } from "geojson";

import distance from "../../src/helpers/distance.js";

describe("distance helper", () => {
  describe("performance sanity", () => {
    it("resolves two disjoint 500-vertex polygons in under 15 milliseconds once warm", () => {
      const circle = (centerLon: number, centerLat: number, radiusDeg: number, n: number): Geometry => ({
        type: "Polygon",
        coordinates: [
          Array.from({ length: n + 1 }, (_, i) => {
            const a = (2 * Math.PI * i) / n;
            return [centerLon + radiusDeg * Math.cos(a), centerLat + radiusDeg * Math.sin(a)];
          }),
        ],
      });

      const a = circle(2.35, 48.85, 0.3, 500);
      const b = circle(2.35, 53.85, 0.3, 500);

      expect(distance(a, b).distance).toBeGreaterThan(0);

      // Time warm runs only: the first calls run before V8 has optimized the code.
      for (let i = 0; i < 5; i++) distance(a, b);
      const samples = Array.from({ length: 15 }, () => {
        const start = performance.now();
        distance(a, b);
        return performance.now() - start;
      }).sort((x, y) => x - y);
      expect(samples[7]).toBeLessThan(15); // median of the warm runs
    });

    it("resolves two nearby irregular ~10000-vertex polygons in under a second", () => {
      const blob = (centerLon: number, centerLat: number, radiusDeg: number, n: number, seed: number): Geometry => ({
        type: "Polygon",
        coordinates: [
          Array.from({ length: n + 1 }, (_, i) => {
            const a = (2 * Math.PI * i) / n;
            const wobble = 1 + 0.15 * Math.sin(a * 7 + seed) + 0.08 * Math.sin(a * 13 + seed * 2);
            return [centerLon + radiusDeg * wobble * Math.cos(a), centerLat + radiusDeg * wobble * Math.sin(a)];
          }),
        ],
      });

      const a = blob(2.0, 48.0, 0.5, 10000, 1);
      const b = blob(4.0, 48.3, 0.5, 10000, 2);

      const start = performance.now();
      const result = distance(a, b);
      const elapsedMs = performance.now() - start;

      expect(result.distance).toBeGreaterThan(0);
      expect(elapsedMs).toBeLessThan(1_000);
    });
  });
});
