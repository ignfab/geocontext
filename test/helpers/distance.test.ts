import distance from "../../src/helpers/distance.js";

import {paris, marseille, besancon, parisMarseille} from '../samples';

describe("Test distance",() => {
    describe("Test distance(Point,Point)", () => {
        it("should return 662489.3m from Paris to Marseille",() => {
            const result = distance(paris,marseille);
            expect(result).toBeCloseTo(662489.3,1);
        });
    });
    describe("Test distance(Point,LineString)", () => {
        it("should return 209731.2m from Besançon to [Paris,Marseille]",() => {
            const result = distance(besancon,parisMarseille);
            expect(result).toBeCloseTo(209731.2,1);
        });
    });

    describe("Test distance(Point,Polygon)", () => {
        it("should return 0m from Paris point to a polygon containing Paris",() => {
            const polygonContainingParis = {
                "type": "Polygon",
                "coordinates": [
                    [
                        [2.0, 48.0],
                        [3.0, 48.0],
                        [3.0, 49.0],
                        [2.0, 49.0],
                        [2.0, 48.0]
                    ]
                ]
            };
            const result = distance(paris, polygonContainingParis);
            expect(result).toEqual(0);
        });
    });
});
