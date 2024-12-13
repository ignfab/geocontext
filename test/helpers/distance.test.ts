import distance from "../../src/helpers/distance.js";

import {paris, marseille, besancon, parisMarseille} from '../samples';

describe("Test distance",() => {
    describe("Test distance(Point,Point)", () => {
        it("should return ~662.5km from Paris to Marseille",() => {
            const result = distance(paris,marseille);
            expect(result).toBeCloseTo(662.5,1);
        });
    });
    describe("Test distance(Point,LineString)", () => {
        it("should return ~209.7km from Besançon to [Paris,Marseille]",() => {
            const result = distance(besancon,parisMarseille);
            expect(result).toBeCloseTo(209.7,1);
        });
    });
});
