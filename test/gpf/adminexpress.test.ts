import {getAdminUnits} from "../../src/gpf/adminexpress.js";
import { mairieLoray } from "../samples";

const adminexpressFeatureCollection = {
    features: [
        {
            id: "commune.1",
            bbox: [6.4, 47.1, 6.5, 47.2],
            properties: {
                nom_officiel: "Loray",
                nom_officiel_en_majuscules: "LORAY",
                code_insee_du_departement: "25",
                code_insee_de_la_region: "27",
                code_siren: "212503494",
            },
        },
        {
            id: "canton.1",
            bbox: [6.4, 47.1, 6.5, 47.2],
            properties: {},
        },
        {
            id: "collectivite_territoriale.1",
            bbox: [6.4, 47.1, 6.5, 47.2],
            properties: {},
        },
        {
            id: "epci.1",
            bbox: [6.4, 47.1, 6.5, 47.2],
            properties: {},
        },
        {
            id: "departement.1",
            bbox: [6.4, 47.1, 6.5, 47.2],
            properties: {
                nom_officiel: "Doubs",
                nom_officiel_en_majuscules: "DOUBS",
                code_insee: "25",
                code_insee_de_la_region: "27",
                code_siren: "222500019",
            },
        },
        {
            id: "region.1",
            bbox: [6.4, 47.1, 6.5, 47.2],
            properties: {},
        },
        {
            id: "arrondissement.1",
            bbox: [6.4, 47.1, 6.5, 47.2],
            properties: {},
        },
    ],
};

describe("Test getAdminUnits",() => {
    it("should return the expected administrative units for Mairie de Loray", async () => {
        const c = mairieLoray.coordinates;
        const items : any[] = await getAdminUnits(c[0],c[1], async () => adminexpressFeatureCollection);

        const itemsTypes = items.map((item) => item.type);
        expect(itemsTypes).toEqual([
            "commune",
            "canton",
            "collectivite_territoriale",
            "epci",
            "departement",
            "region",
            "arrondissement"
        ]);

        // check item of type departement
        {
            const departement = items.filter((item)=>item.type === 'departement')[0];
            expect(departement).not.toBeUndefined();
            expect(departement.feature_ref).toEqual({
                typename: "ADMINEXPRESS-COG.LATEST:departement",
                feature_id: "departement.1",
            });
            expect(departement.nom_officiel).toEqual('Doubs');
            expect(departement.nom_officiel_en_majuscules).toEqual('DOUBS');
            expect(departement.code_insee).toEqual('25');
            expect(departement.code_insee_de_la_region).toEqual('27');
            expect(departement.code_siren).toEqual('222500019');
        }

        // check item of type commune
        {
            const commune = items.filter((item)=>item.type === 'commune')[0];
            expect(commune).not.toBeUndefined();
            expect(commune.feature_ref).toEqual({
                typename: "ADMINEXPRESS-COG.LATEST:commune",
                feature_id: "commune.1",
            });
            expect(commune.nom_officiel).toEqual('Loray');
            expect(commune.nom_officiel_en_majuscules).toEqual('LORAY');
            expect(commune.code_insee_du_departement).toEqual('25');
            expect(commune.code_insee_de_la_region).toEqual('27');
            expect(commune.code_siren).toEqual('212503494');
        }
    });
});
