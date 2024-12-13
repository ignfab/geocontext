import {getParcellaireExpress} from "../../src/gpf/parcellaire-express.js";
import { mairieLoray } from "../samples";

describe("Test getParcellaireExpress",() => {
    it("should expected values for Mairie de Loray", async () => {
        const c = mairieLoray.coordinates;
        const items : any[] = await getParcellaireExpress(c[0],c[1]);

        const itemsTypes = items.map((item) => item.type);
        expect(itemsTypes).toEqual([
            "commune",
            "feuille",
            "parcelle"
        ]);

        for ( const item of items ){
            expect(item.source).toEqual('Géoplateforme (WFS, CADASTRALPARCELS.PARCELLAIRE_EXPRESS)');
        }

        // check item of type parcelle
        {
            const parcelle = items.filter((item)=>item.type === 'parcelle')[0];
            expect(parcelle).not.toBeUndefined();
            expect(parcelle.idu).toEqual('25349000AD0023');
        }

    });
});
