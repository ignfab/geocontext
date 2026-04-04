import {getUrbanisme, getAssiettesServitudes} from "../../src/gpf/urbanisme.js";
import { chamonix, mairieLoray } from "../samples";

const urbanismeFeatureCollection: {
    features: Array<{
        id: string;
        bbox: number[];
        geometry: {
            type: string;
            coordinates: number[];
        };
        properties: Record<string, string | null>;
    }>;
} = {
    features: [
        {
            id: "document.1",
            bbox: [6.86, 45.92, 6.87, 45.93],
            geometry: {
                type: "Point",
                coordinates: [6.865, 45.924],
            },
            properties: {
                du_type: "PLU",
                gpu_doc_id: "DOC-123",
                gpu_status: "published",
                urlfic: "https://example.test/doc",
                empty_field: "",
                nullable_field: null,
            },
        },
        {
            id: "zone_urba.1",
            bbox: [6.86, 45.92, 6.87, 45.93],
            geometry: {
                type: "Point",
                coordinates: [6.8653, 45.9243],
            },
            properties: {
                libelle: "Zone U",
            },
        },
    ],
};

const assiettesFeatureCollection: {
    features: Array<{
        id: string;
        bbox: number[];
        geometry: {
            type: string;
            coordinates: number[];
        };
        properties: Record<string, string>;
    }>;
} = {
    features: [
        {
            id: "assiette_sup_s.1",
            bbox: [6.49, 47.15, 6.50, 47.16],
            geometry: {
                type: "Point",
                coordinates: [6.497148, 47.153263],
            },
            properties: {
                nomsuplitt: "Croix de l'ancien cimetière",
            },
        },
        {
            id: "assiette_sup_s.2",
            bbox: [6.49, 47.15, 6.50, 47.16],
            geometry: {
                type: "Point",
                coordinates: [6.497248, 47.153163],
            },
            properties: {
                nomsuplitt: "Fontaine-lavoir",
            },
        },
    ],
};

describe("Test getUrbanisme",() => {
    it("should return the expected urbanisme objects for Chamonix", async () => {
        const c = chamonix.coordinates;
        const items : any[] = await getUrbanisme(c[0],c[1], async () => urbanismeFeatureCollection);

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
        const items : any[] = await getUrbanisme(c[0],c[1], async () => urbanismeFeatureCollection);

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
    it("should return the expected assiettes for Loray", async () => {
        const c = mairieLoray.coordinates;
        const items : any[] = await getAssiettesServitudes(c[0],c[1], async () => assiettesFeatureCollection);

        const itemsTypes = items.map((item) => item.type);
        expect(itemsTypes).toContain('assiette_sup_s');

        const names = items.map((item)=>item.nomsuplitt);
        expect(names).toContain("Croix de l'ancien cimetière");
        expect(names).toContain('Fontaine-lavoir');
    });
});
