import {getAltitudeByLocation} from "../../src/gpf/altitude.js";
import { paris } from "../samples";

const rawAltitudeServiceResponse = {
    elevations: [
        {
            lon: 2.333333,
            lat: 48.866667,
            z: 34.78,
            acc: "Variable suivant la source de mesure",
        },
    ],
};

const rawVoidAltitudeServiceResponse = {
    elevations: [
        {
            lon: 0.0,
            lat: 0.0,
            z: -99999,
            acc: "Variable suivant la source de mesure",
        },
    ],
};

describe("Test getAltitudeByLocation",() => {
    it("should return ~34.8 meters for Paris", async () => {
        const c = paris.coordinates;
        const result = await getAltitudeByLocation(c[0],c[1], async () => rawAltitudeServiceResponse);
        expect(result.lat).toBeCloseTo(48.866667, 5);
        expect(result.lon).toBeCloseTo(2.333333, 5);
        expect(result.altitude).toBeCloseTo(34.8,1);
        expect(result.accuracy).toEqual("Variable suivant la source de mesure");
    });


    it("should return the sentinel altitude value for 0.0,0.0", async () => {
        const result = await getAltitudeByLocation(0.0,0.0, async () => rawVoidAltitudeServiceResponse);
        expect(result.altitude).toEqual(-99999);
        expect(result.accuracy).toEqual("Variable suivant la source de mesure");
    });


    it("should throw for 600.0,600.0", async () => {
        await expect(getAltitudeByLocation(600.0,600.0, async () => ({ elevations: [] }))).rejects.toThrow(
            "Le service d'altitude n'a renvoyé aucune donnée d'altitude"
        );
    });

});
