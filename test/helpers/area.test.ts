import { describe, expect, it } from "vitest";

import { clipRingToTriangle, sphericalRingArea } from "../../src/helpers/area.js";

describe("helpers/area", () => {
  describe("clipRingToTriangle", () => {
    it("should clip by a triangle whatever its winding", () => {
      // The triangle covers the north-eastern quarter of the square.
      const square = [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]];
      const quarter = sphericalRingArea([[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]);
      const [a, b, c] = [[1, 1], [3, 1], [1, 3]];

      expect(sphericalRingArea(clipRingToTriangle(square, [a, b, c]))).toBeCloseTo(quarter, 12);
      expect(sphericalRingArea(clipRingToTriangle(square, [a, c, b]))).toBeCloseTo(quarter, 12);
    });
  });
});
