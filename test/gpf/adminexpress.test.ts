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
            expect(departement.nom).toEqual('Doubs');
            expect(departement.nom_m).toEqual('DOUBS');
            expect(departement.insee_dep).toEqual('25');
            expect(departement.insee_reg).toEqual('27');
            expect(departement.insee_reg).toEqual('27');
        }

        // check item of type commune
        {
            const commune = items.filter((item)=>item.type === 'commune')[0];
            expect(commune).not.toBeUndefined();
            expect(commune.nom).toEqual('Loray');
            expect(commune.nom_m).toEqual('LORAY');
            expect(commune.insee_dep).toEqual('25');
            expect(commune.insee_reg).toEqual('27');
        }
    });
});
