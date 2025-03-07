import distance from "../../src/helpers/distance.js";

import {paris, marseille, besancon, parisMarseille} from '../samples';

describe("Test distance",() => {
    describe("Test distance(Point,Point)", () => {
        it("should return ~718.8km from Paris to Marseille",() => {
            const result = distance(paris,marseille);
            expect(result).toBeCloseTo(718.8,1);
        });
    });
    describe("Test distance(Point,LineString)", () => {
        it("should return ~276.7km from Besançon to [Paris,Marseille]",() => {
            const result = distance(besancon,parisMarseille);
            expect(result).toBeCloseTo(276.7,1);
        });
    });
});
