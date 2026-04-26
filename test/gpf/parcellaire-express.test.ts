import { vi } from "vitest";
import { mairieLoray } from "../samples";

const mockGetFeatureType = vi.fn<(typename: string) => Promise<any>>();
const mockFetchWfsMultiTypename = vi.fn<(input: any) => Promise<any>>();

vi.doMock("../../src/helpers/wfs_engine/execution.js", () => ({
    getFeatureType: mockGetFeatureType,
    fetchWfsMultiTypename: mockFetchWfsMultiTypename,
}));

const { getParcellaireExpress } = await import("../../src/gpf/parcellaire-express.js");

const parcellaireExpressFeatureCollection = {
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

describe("Test getParcellaireExpress", () => {
    beforeEach(() => {
        mockGetFeatureType.mockResolvedValue({
            id: "CADASTRALPARCELS.PARCELLAIRE_EXPRESS:arrondissement",
            properties: [
                { name: "geometrie", type: "multipolygon", defaultCrs: "EPSG:4326" },
            ],
        });
        mockFetchWfsMultiTypename.mockResolvedValue(parcellaireExpressFeatureCollection);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should return the expected cadastral objects for Mairie de Loray", async () => {
        const c = mairieLoray.coordinates;
        const items: any[] = await getParcellaireExpress(c[0], c[1]);

        const itemsTypes = items.map((item) => item.type);
        expect(itemsTypes).toEqual([
            "commune",
            "feuille",
            "parcelle"
        ]);

        // check item of type parcelle
        {
            const parcelle = items.filter((item) => item.type === 'parcelle')[0];
            expect(parcelle).not.toBeUndefined();
            expect(parcelle.feature_ref).toEqual({
                typename: "CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle",
                feature_id: "parcelle.1",
            });
            expect(parcelle.idu).toEqual('25349000AD0023');
        }

    });
});
