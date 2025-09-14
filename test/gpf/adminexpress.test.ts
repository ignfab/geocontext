import {getAdminUnits} from "../../src/gpf/adminexpress.js";
import { mairieLoray } from "../samples";

describe("Test getAdminUnits",() => {
    it("should expected values for Mairie de Loray", async () => {
        const c = mairieLoray.coordinates;
        const items : any[] = await getAdminUnits(c[0],c[1]);

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

        for ( const item of items ){
            expect(item.source).toEqual('Géoplateforme (WFS, ADMINEXPRESS-COG.LATEST)');
        }

        // check item of type departement
        {
            const departement = items.filter((item)=>item.type === 'departement')[0];
            expect(departement).not.toBeUndefined();
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
            expect(commune.nom_officiel).toEqual('Loray');
            expect(commune.nom_officiel_en_majuscules).toEqual('LORAY');
            expect(commune.code_insee_du_departement).toEqual('25');
            expect(commune.code_insee_de_la_region).toEqual('27');
            expect(commune.code_siren).toEqual('212503494');
        }
    });
});
