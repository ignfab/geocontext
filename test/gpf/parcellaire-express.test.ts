import {getParcellaireExpress} from "../../src/gpf/parcellaire-express.js";
import { mairieLoray } from "../samples";
import type { Point } from "geojson";
import type { WfsFeatureCollection, WfsFeatureWithGeometry } from "../../src/helpers/wfs.js";

const parcellaireExpressFeatureCollection: WfsFeatureCollection<WfsFeatureWithGeometry>  = {
    features: [
        {
            id: "commune.1",
            bbox: [6.49, 47.15, 6.50, 47.16],
            geometry: {
                type: "Point",
                coordinates: [6.497148, 47.153363],
            },
            properties: {
                nom_officiel: "Loray",
            },
        },
        {
            id: "commune.2",
            bbox: [6.48, 47.14, 6.51, 47.17],
            geometry: {
                type: "Point",
                coordinates: [6.497148, 47.154263],
            },
            properties: {
                nom_officiel: "Loray 2",
            },
        },
        {
            id: "feuille.1",
            bbox: [6.49, 47.15, 6.50, 47.16],
            geometry: {
                type: "Point",
                coordinates: [6.497248, 47.153263],
            },
            properties: {},
        },
        {
            id: "parcelle.1",
            bbox: [6.49, 47.15, 6.50, 47.16],
            geometry: {
                type: "Point",
                coordinates: [6.497148, 47.153263],
            },
            properties: {
                idu: "25349000AD0023",
            },
        },
    ],
};

describe("Test getParcellaireExpress",() => {
    it("should return the expected cadastral objects for Mairie de Loray", async () => {
        const c = mairieLoray.coordinates;
        const items : any[] = await getParcellaireExpress(c[0],c[1], async () => parcellaireExpressFeatureCollection);

        const itemsTypes = items.map((item) => item.type);
        expect(itemsTypes).toEqual([
            "commune",
            "feuille",
            "parcelle"
        ]);

        // check item of type parcelle
        {
            const parcelle = items.filter((item)=>item.type === 'parcelle')[0];
            expect(parcelle).not.toBeUndefined();
            expect(parcelle.feature_ref).toEqual({
                typename: "CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle",
                feature_id: "parcelle.1",
            });
            expect(parcelle.idu).toEqual('25349000AD0023');
        }

    });
});
