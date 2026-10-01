import { describe, expect, it } from "vitest";

import { sphericalRingArea } from "../../src/helpers/area.js";

describe("helpers/area", () => {
  describe("sphericalRingArea", () => {
    it("should be exact for a lon/lat box", () => {
      // dLon · (sin(north) - sin(south)) on the unit sphere
      const box = [[2, 48], [3, 48], [3, 49], [2, 49], [2, 48]];
      const expected = (Math.PI / 180) * (Math.sin(49 * Math.PI / 180) - Math.sin(48 * Math.PI / 180));

      expect(sphericalRingArea(box)).toBeCloseTo(expected, 15);
    });

    it("should not change when an edge is split, as clipping does", () => {
      const triangle = [[2, 48], [3, 48.2], [2.4, 49], [2, 48]];
      const split = [[2, 48], [2.5, 48.1], [3, 48.2], [2.4, 49], [2, 48]];

      expect(sphericalRingArea(split)).toBeCloseTo(sphericalRingArea(triangle), 15);
    });
  });
});
