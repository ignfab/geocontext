import AdminexpressTool from "../../src/tools/AdminexpressTool";
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

const adminexpressResults = [
    {
        type: "commune",
        id: "commune.1",
        bbox: [6.4, 47.1, 6.5, 47.2],
        nom_officiel: "Loray",
        nom_officiel_en_majuscules: "LORAY",
        code_insee_du_departement: "25",
        code_insee_de_la_region: "27",
        code_siren: "212503494",
    },
    {
        type: "canton",
        id: "canton.1",
        bbox: [6.4, 47.1, 6.5, 47.2],
    },
    {
        type: "collectivite_territoriale",
        id: "collectivite_territoriale.1",
        bbox: [6.4, 47.1, 6.5, 47.2],
    },
    {
        type: "epci",
        id: "epci.1",
        bbox: [6.4, 47.1, 6.5, 47.2],
    },
    {
        type: "departement",
        id: "departement.1",
        bbox: [6.4, 47.1, 6.5, 47.2],
        nom_officiel: "Doubs",
        nom_officiel_en_majuscules: "DOUBS",
        code_insee: "25",
        code_insee_de_la_region: "27",
        code_siren: "222500019",
    },
    {
        type: "region",
        id: "region.1",
        bbox: [6.4, 47.1, 6.5, 47.2],
    },
    {
        type: "arrondissement",
        id: "arrondissement.1",
        bbox: [6.4, 47.1, 6.5, 47.2],
    },
];

describe("Test getAdminUnits",() => {
    it("should expected values for Mairie de Loray", async () => {
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

describe("Test AdminexpressTool",() => {
    class TestableAdminexpressTool extends AdminexpressTool {
        async execute() {
            return {
                results: adminexpressResults,
            };
        }
    }

    it("should expose an enriched MCP definition", () => {
        const tool = new AdminexpressTool();
        expect(tool.toolDefinition.title).toEqual("Unités administratives");
        expect(tool.toolDefinition.inputSchema.properties?.lon).toMatchObject({
            type: "number",
            minimum: -180,
            maximum: 180,
        });
        expect(tool.toolDefinition.inputSchema.properties?.lat).toMatchObject({
            type: "number",
            minimum: -90,
            maximum: 90,
        });
        expect(tool.toolDefinition.outputSchema).toBeDefined();
    });

    it("should return both text content and structuredContent", async () => {
        const c = mairieLoray.coordinates;
        const tool = new TestableAdminexpressTool();
        const response = await tool.toolCall({
            params: {
                name: "adminexpress",
                arguments: {
                    lon: c[0],
                    lat: c[1],
                },
            },
        });

        expect(response.isError).toBeUndefined();
        expect(response.content[0]).toMatchObject({
            type: "text",
        });
        const textContent = response.content[0];
        if (textContent.type !== "text") {
            throw new Error("expected text content");
        }
        const results = JSON.parse(textContent.text);
        expect(results).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: "commune",
                nom_officiel: "Loray",
            }),
            expect.objectContaining({
                type: "departement",
                nom_officiel: "Doubs",
            }),
        ]));
        expect(response.structuredContent).toMatchObject({
            results: expect.arrayContaining([
                expect.objectContaining({
                    type: "commune",
                    nom_officiel: "Loray",
                }),
                expect.objectContaining({
                    type: "departement",
                    nom_officiel: "Doubs",
                }),
            ]),
        });
    });

    it("should return isError=true for invalid input", async () => {
        const tool = new AdminexpressTool();
        const response = await tool.toolCall({
            params: {
                name: "adminexpress",
                arguments: {
                    lon: 600,
                    lat: 600,
                },
            },
        });

        expect(response.isError).toBe(true);
        expect(response.content[0]).toMatchObject({
            type: "text",
        });
        const textContent = response.content[0];
        if (textContent.type !== "text") {
            throw new Error("expected text content");
        }
        expect(textContent.text).toContain("Number must be less than or equal to 180");
    });
});
