import {getUrbanisme, getAssiettesServitudes} from "../../src/gpf/urbanisme.js";
import { chamonix, mairieLoray } from "../samples";

describe("Test getUrbanisme",() => {
    it("should expected values for Chamonix", async () => {
        const c = chamonix.coordinates;
        const items : any[] = await getUrbanisme(c[0],c[1]);

        const itemsTypes = items.map((item) => item.type);
        expect(itemsTypes).toContain('document');

        // check item of type document
        {
            const document = items.filter((item)=>item.type === 'document')[0];
            expect(document).not.toBeUndefined();
            // might change (ex : PLU -> PLUi)
            expect(document.du_type).toEqual('PLU');
        }

    });

    it("should filter non relevant urbanisme properties", async () => {
        const c = chamonix.coordinates;
        const items : any[] = await getUrbanisme(c[0],c[1]);

        expect(items.length).toBeGreaterThan(0);

        for (const item of items) {
            expect(item).not.toHaveProperty('gpu_status');
            expect(item).not.toHaveProperty('urlfic');
            expect(Object.values(item)).not.toContain(null);
            expect(Object.values(item)).not.toContain('');
        }
    });
});

describe("Test getAssiettesServitudes",() => {
    it("should expected values for Loray", async () => {
        const c = mairieLoray.coordinates;
        const items : any[] = await getAssiettesServitudes(c[0],c[1]);

        const itemsTypes = items.map((item) => item.type);
        expect(itemsTypes).toContain('assiette_sup_s');

        const names = items.map((item)=>item.nomsuplitt);
        expect(names).toContain("Croix de l'ancien cimetière");
        expect(names).toContain('Fontaine-lavoir');
    });
});
