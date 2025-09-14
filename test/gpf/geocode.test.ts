import {geocode} from "../../src/gpf/geocode.js";

describe("Test geocode",() => {
    it("should return the expected value for 'Mairie de Loray'", async () => {
        const results : any[] = await geocode("Mairie de Loray");
        expect(results.length).toBeGreaterThanOrEqual(0);
        const firstItem = results[0];

        //   x: 6.497148,
        expect(firstItem.x).toBeCloseTo(6.497148,5);
        //   y: 47.153263,
        expect(firstItem.y).toBeCloseTo(47.153263,5);
        //   country: 'PositionOfInterest',
        expect(firstItem.country).toEqual("PositionOfInterest");
        //   names: [ 'Mairie de Loray' ],
        expect(firstItem.names).toEqual([ 'Mairie de Loray' ]);
        //   city: 'Loray',
        //   zipcode: '25390',
        //   zipcodes: [ '25390' ],
        //   metropole: true,
        //   poiType: [ 'mairie', "zone d'activité ou d'intérêt" ],
        //   street: 'Mairie de Loray',
        //   kind: 'mairie',
        //   fulltext: 'Mairie de Loray, 25390 Loray',
        expect(firstItem.fulltext).toEqual('Mairie de Loray, 25390 Loray');
        //   classification: 9

    });

});
