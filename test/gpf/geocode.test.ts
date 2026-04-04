import {geocode} from "../../src/gpf/geocode.js";

const rawGeocodeServiceResponse = {
    results: [
        {
            x: 6.497148,
            y: 47.153263,
            country: "PositionOfInterest",
            names: ["Mairie de Loray"],
            fulltext: "Mairie de Loray, 25390 Loray",
            kind: "mairie",
            city: "Loray",
            zipcode: "25390",
            zipcodes: ["25390"],
            metropole: true,
            poiType: ["mairie", "zone d'activité ou d'intérêt"],
            street: "Mairie de Loray",
            classification: 9,
        },
        {
            x: 2.41935,
            y: 48.841291,
            country: "StreetAddress",
            names: ["Saint-Mandé"],
            fulltext: "Saint-Mandé, 94160",
            kind: "commune",
            city: "Saint-Mandé",
            zipcode: "94160",
            zipcodes: ["94160"],
            metropole: true,
            classification: 8,
        },
    ],
};

describe("Test geocode",() => {
    it("should return the expected value for 'Mairie de Loray'", async () => {
        const results : any[] = await geocode("Mairie de Loray", 3, async () => ({
            results: [rawGeocodeServiceResponse.results[0]],
        }));
        expect(results.length).toBeGreaterThan(0);
        const firstItem = results[0];

        expect(firstItem.lon).toBeCloseTo(6.497148,5);
        expect(firstItem.lat).toBeCloseTo(47.153263,5);
        expect(firstItem.fulltext).toEqual('Mairie de Loray, 25390 Loray');
        expect(firstItem.kind).toEqual('mairie');
        expect(firstItem.city).toEqual('Loray');
        expect(firstItem.zipcode).toEqual('25390');

    });

    it("should honor maximumResponses", async () => {
        const results : any[] = await geocode("Saint-Mande", 1, async () => ({
            results: [rawGeocodeServiceResponse.results[1]],
        }));

        expect(results).toHaveLength(1);
        expect(results[0].fulltext).toEqual("Saint-Mandé, 94160");
    });

    it("should return an empty array for blank text", async () => {
        const results : any[] = await geocode("   ");

        expect(results).toEqual([]);
    });

});
