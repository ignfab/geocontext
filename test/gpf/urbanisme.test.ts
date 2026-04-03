import AssietteSupTool from "../../src/tools/AssietteSupTool";
import UrbanismeTool from "../../src/tools/UrbanismeTool";
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
    it("should expected values for Chamonix", async () => {
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
    it("should expected values for Loray", async () => {
        const c = mairieLoray.coordinates;
        const items : any[] = await getAssiettesServitudes(c[0],c[1], async () => assiettesFeatureCollection);

        const itemsTypes = items.map((item) => item.type);
        expect(itemsTypes).toContain('assiette_sup_s');

        const names = items.map((item)=>item.nomsuplitt);
        expect(names).toContain("Croix de l'ancien cimetière");
        expect(names).toContain('Fontaine-lavoir');
    });
});

describe("Test UrbanismeTool",() => {
    class TestableUrbanismeTool extends UrbanismeTool {
        async execute() {
            return {
                results: await getUrbanisme(
                    chamonix.coordinates[0],
                    chamonix.coordinates[1],
                    async () => urbanismeFeatureCollection
                ),
            };
        }
    }

    it("should expose an enriched MCP definition", () => {
        const tool = new UrbanismeTool();
        expect(tool.toolDefinition.title).toEqual("Informations d’urbanisme");
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
        const tool = new TestableUrbanismeTool();
        const response = await tool.toolCall({
            params: {
                name: "urbanisme",
                arguments: {
                    lon: chamonix.coordinates[0],
                    lat: chamonix.coordinates[1],
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
                type: "document",
                du_type: "PLU",
            }),
        ]));
        expect(response.structuredContent).toMatchObject({
            results: expect.arrayContaining([
                expect.objectContaining({
                    type: "document",
                    du_type: "PLU",
                }),
                expect.objectContaining({
                    type: "zone_urba",
                    libelle: "Zone U",
                }),
            ]),
        });
    });

    it("should return isError=true for invalid input", async () => {
        const tool = new UrbanismeTool();
        const response = await tool.toolCall({
            params: {
                name: "urbanisme",
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

describe("Test AssietteSupTool",() => {
    class TestableAssietteSupTool extends AssietteSupTool {
        async execute() {
            return {
                results: await getAssiettesServitudes(
                    mairieLoray.coordinates[0],
                    mairieLoray.coordinates[1],
                    async () => assiettesFeatureCollection
                ),
            };
        }
    }

    it("should expose an enriched MCP definition", () => {
        const tool = new AssietteSupTool();
        expect(tool.toolDefinition.title).toEqual("Servitudes d’utilité publique");
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
        const tool = new TestableAssietteSupTool();
        const response = await tool.toolCall({
            params: {
                name: "assiette_sup",
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
                type: "assiette_sup_s",
                nomsuplitt: "Croix de l'ancien cimetière",
            }),
        ]));
        expect(response.structuredContent).toMatchObject({
            results: expect.arrayContaining([
                expect.objectContaining({
                    type: "assiette_sup_s",
                    nomsuplitt: "Croix de l'ancien cimetière",
                }),
                expect.objectContaining({
                    type: "assiette_sup_s",
                    nomsuplitt: "Fontaine-lavoir",
                }),
            ]),
        });
    });

    it("should return isError=true for invalid input", async () => {
        const tool = new AssietteSupTool();
        const response = await tool.toolCall({
            params: {
                name: "assiette_sup",
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
