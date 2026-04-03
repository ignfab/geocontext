import {geocode} from "../../src/gpf/geocode.js";

describe("Test geocode",() => {
    it("should return the expected value for 'Mairie de Loray'", async () => {
        const results : any[] = await geocode("Mairie de Loray");
        expect(results.length).toBeGreaterThanOrEqual(0);
        const firstItem = results[0];

        //   x: 6.497148,
        expect(firstItem.lon).toBeCloseTo(6.497148,5);
        //   y: 47.153263,
        expect(firstItem.lat).toBeCloseTo(47.153263,5);
        //   country: 'PositionOfInterest',
        //   names: [ 'Mairie de Loray' ],
        //   city: 'Loray',
        //   zipcode: '25390',
        //   zipcodes: [ '25390' ],
        //   metropole: true,
        //   poiType: [ 'mairie', "zone d'activité ou d'intérêt" ],
        //   street: 'Mairie de Loray',
        //   kind: 'mairie',
        //   fulltext: 'Mairie de Loray, 25390 Loray',
        expect(firstItem.fulltext).toEqual('Mairie de Loray, 25390 Loray');
        expect(firstItem.kind).toEqual('mairie');
        expect(firstItem.city).toEqual('Loray');
        expect(firstItem.zipcode).toEqual('25390');
        //   classification: 9

    });

    it("should honor maximumResponses", async () => {
        const results : any[] = await geocode("Saint-Mande", 1);

        expect(results).toHaveLength(1);
        expect(results[0].fulltext).toEqual("Saint-Mandé, 94160");
    });

    it("should return an empty array for blank text", async () => {
        const results : any[] = await geocode("   ");

        expect(results).toEqual([]);
    });

});
