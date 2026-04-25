import AssietteSupTool from "../../src/tools/AssietteSupTool";
import UrbanismeTool from "../../src/tools/UrbanismeTool";
import { chamonix, mairieLoray } from "../samples";

describe("Test UrbanismeTool",() => {
    class TestableUrbanismeTool extends UrbanismeTool {
        async execute() {
            return {
                results: [
                    {
                        type: "document",
                        id: "document.1",
                        feature_ref: {
                            typename: "wfs_du:document",
                            feature_id: "document.1",
                        },
                        du_type: "PLU",
                        distance: 0,
                    },
                    {
                        type: "zone_urba",
                        id: "zone_urba.1",
                        feature_ref: {
                            typename: "wfs_du:zone_urba",
                            feature_id: "zone_urba.1",
                        },
                        libelle: "Zone U",
                        distance: 5,
                    },
                ],
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
        const payload = JSON.parse(textContent.text);
        const results = payload.results;
        expect(results).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: "document",
                du_type: "PLU",
                feature_ref: {
                    typename: "wfs_du:document",
                    feature_id: "document.1",
                },
            }),
        ]));
        expect(response.structuredContent).toMatchObject({
            results: expect.arrayContaining([
                expect.objectContaining({
                    type: "document",
                    du_type: "PLU",
                    feature_ref: {
                        typename: "wfs_du:document",
                        feature_id: "document.1",
                    },
                }),
                expect.objectContaining({
                    type: "zone_urba",
                    libelle: "Zone U",
                    feature_ref: {
                        typename: "wfs_du:zone_urba",
                        feature_id: "zone_urba.1",
                    },
                }),
            ]),
        });
        expect(payload).toMatchObject(response.structuredContent as Record<string, unknown>);
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
        expect(textContent.text).toContain("Paramètres invalides");
        expect(response.structuredContent).toMatchObject({
            type: "urn:geocontext:problem:invalid-tool-params",
            errors: expect.arrayContaining([
                expect.objectContaining({
                    name: "lon",
                    code: "too_big",
                }),
            ]),
        });
    });
});

describe("Test AssietteSupTool",() => {
    class TestableAssietteSupTool extends AssietteSupTool {
        async execute() {
            return {
                results: [
                    {
                        type: "assiette_sup_s",
                        id: "assiette_sup_s.1",
                        feature_ref: {
                            typename: "wfs_sup:assiette_sup_s",
                            feature_id: "assiette_sup_s.1",
                        },
                        nomsuplitt: "Croix de l'ancien cimetière",
                        distance: 0,
                    },
                    {
                        type: "assiette_sup_s",
                        id: "assiette_sup_s.2",
                        feature_ref: {
                            typename: "wfs_sup:assiette_sup_s",
                            feature_id: "assiette_sup_s.2",
                        },
                        nomsuplitt: "Fontaine-lavoir",
                        distance: 10,
                    },
                ],
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
        const payload = JSON.parse(textContent.text);
        const results = payload.results;
        expect(results).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: "assiette_sup_s",
                nomsuplitt: "Croix de l'ancien cimetière",
                feature_ref: {
                    typename: "wfs_sup:assiette_sup_s",
                    feature_id: "assiette_sup_s.1",
                },
            }),
        ]));
        expect(response.structuredContent).toMatchObject({
            results: expect.arrayContaining([
                expect.objectContaining({
                    type: "assiette_sup_s",
                    nomsuplitt: "Croix de l'ancien cimetière",
                    feature_ref: {
                        typename: "wfs_sup:assiette_sup_s",
                        feature_id: "assiette_sup_s.1",
                    },
                }),
                expect.objectContaining({
                    type: "assiette_sup_s",
                    nomsuplitt: "Fontaine-lavoir",
                    feature_ref: {
                        typename: "wfs_sup:assiette_sup_s",
                        feature_id: "assiette_sup_s.2",
                    },
                }),
            ]),
        });
        expect(payload).toMatchObject(response.structuredContent as Record<string, unknown>);
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
        expect(textContent.text).toContain("Paramètres invalides");
        expect(response.structuredContent).toMatchObject({
            type: "urn:geocontext:problem:invalid-tool-params",
            errors: expect.arrayContaining([
                expect.objectContaining({
                    name: "lon",
                    code: "too_big",
                }),
            ]),
        });
    });
});
