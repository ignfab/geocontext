import {getAltitudeByLocation} from "../../src/gpf/altitude.js";
import { paris } from "../samples";

describe("Test getAltitudeByLocation",() => {
    it("should return ~34.8 meters for Paris", async () => {
        const c = paris.coordinates;
        const result = await getAltitudeByLocation(c[0],c[1]);
        expect(result.lat).toBeCloseTo(48.866667);
        expect(result.lon).toBeCloseTo(2.333333);
        expect(result.altitude).toBeCloseTo(34.8,1);
        expect(result.accuracy).toEqual("Variable suivant la source de mesure");
        expect(result.source).toEqual("Géoplateforme (altimétrie)");
    });


    it("should throw return null for 0.0,0.0", async () => {
        const c = paris.coordinates;
        const result = await getAltitudeByLocation(0.0,0.0);
        expect(result.altitude).toEqual(-99999);
        expect(result.accuracy).toEqual("Variable suivant la source de mesure");
    });


    it("should throw return null for 600.0,600.0", async () => {
        const c = paris.coordinates;
        const result = await getAltitudeByLocation(600.0,600.0);
        expect(result.altitude).toBeNull();
        expect(result.accuracy).toEqual("No data");
    });

});
