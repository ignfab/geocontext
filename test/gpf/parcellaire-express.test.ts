import CadastreTool from "../../src/tools/CadastreTool";
import {getParcellaireExpress} from "../../src/gpf/parcellaire-express.js";
import { mairieLoray } from "../samples";

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

describe("Test getParcellaireExpress",() => {
    it("should expected values for Mairie de Loray", async () => {
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
            expect(parcelle.idu).toEqual('25349000AD0023');
        }

    });
});

describe("Test CadastreTool",() => {
    class TestableCadastreTool extends CadastreTool {
        async execute() {
            return {
                results: await getParcellaireExpress(
                    mairieLoray.coordinates[0],
                    mairieLoray.coordinates[1],
                    async () => parcellaireExpressFeatureCollection
                ),
            };
        }
    }

    it("should expose an enriched MCP definition", () => {
        const tool = new CadastreTool();
        expect(tool.toolDefinition.title).toEqual("Informations cadastrales");
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
        const tool = new TestableCadastreTool();
        const response = await tool.toolCall({
            params: {
                name: "cadastre",
                arguments: {
                    lon: mairieLoray.coordinates[0],
                    lat: mairieLoray.coordinates[1],
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
                type: "parcelle",
                idu: "25349000AD0023",
            }),
        ]));
        expect(response.structuredContent).toMatchObject({
            results: expect.arrayContaining([
                expect.objectContaining({
                    type: "commune",
                    nom_officiel: "Loray",
                }),
                expect.objectContaining({
                    type: "parcelle",
                    idu: "25349000AD0023",
                }),
            ]),
        });
    });

    it("should return isError=true for invalid input", async () => {
        const tool = new CadastreTool();
        const response = await tool.toolCall({
            params: {
                name: "cadastre",
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
