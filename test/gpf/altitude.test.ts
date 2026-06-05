import { describe, expect, it } from "vitest";
import { AltitudeClient } from "../../src/gpf/altitude.js";
import { RateLimiter } from "../../src/helpers/RateLimiter.js";
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

describe("Test AltitudeClient.getByLocation",() => {
    it("should return ~34.8 meters for Paris", async () => {
        const rateLimiter = new RateLimiter({ name: "test", maxCalls: 100, period: 1 });
        const client = new AltitudeClient(rateLimiter, async () => rawAltitudeServiceResponse);
        const c = paris.coordinates;
        const result = await client.getByLocation(c[0], c[1]);
        expect(result.lat).toBeCloseTo(48.866667, 5);
        expect(result.lon).toBeCloseTo(2.333333, 5);
        expect(result.altitude).toBeCloseTo(34.8,1);
        expect(result.accuracy).toEqual("Variable suivant la source de mesure");
    });


    it("should return the sentinel altitude value for 0.0,0.0", async () => {
        const rateLimiter = new RateLimiter({ name: "test", maxCalls: 100, period: 1 });
        const client = new AltitudeClient(rateLimiter, async () => rawVoidAltitudeServiceResponse);
        const result = await client.getByLocation(0.0, 0.0);
        expect(result.altitude).toEqual(-99999);
        expect(result.accuracy).toEqual("Variable suivant la source de mesure");
    });


    it("should throw for 600.0,600.0", async () => {
        const rateLimiter = new RateLimiter({ name: "test", maxCalls: 100, period: 1 });
        const client = new AltitudeClient(rateLimiter, async () => ({ elevations: [] }));
        await expect(client.getByLocation(600.0, 600.0)).rejects.toThrow(
            "Le service d'altitude n'a renvoyé aucune donnée d'altitude"
        );
    });

});
