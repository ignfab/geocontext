import CadastreTool from "../../src/tools/CadastreTool";
import { mairieLoray } from "../samples";

describe("Test CadastreTool",() => {
    class TestableCadastreTool extends CadastreTool {
        async execute() {
            return {
                results: [
                    {
                        type: "commune",
                        id: "commune.1",
                        bbox: [6.49, 47.15, 6.50, 47.16],
                        feature_ref: {
                            typename: "CADASTRALPARCELS.PARCELLAIRE_EXPRESS:commune",
                            feature_id: "commune.1",
                        },
                        nom_officiel: "Loray",
                        distance: 5,
                        source: "mock",
                    },
                    {
                        type: "parcelle",
                        id: "parcelle.1",
                        bbox: [6.49, 47.15, 6.50, 47.16],
                        feature_ref: {
                            typename: "CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle",
                            feature_id: "parcelle.1",
                        },
                        idu: "25349000AD0023",
                        distance: 0,
                        source: "mock",
                    },
                ],
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
        const payload = JSON.parse(textContent.text);
        const results = payload.results;
        expect(results).toEqual(expect.arrayContaining([
            expect.objectContaining({
                type: "parcelle",
                idu: "25349000AD0023",
                feature_ref: {
                    typename: "CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle",
                    feature_id: "parcelle.1",
                },
            }),
        ]));
        expect(response.structuredContent).toMatchObject({
            results: expect.arrayContaining([
                expect.objectContaining({
                    type: "commune",
                    nom_officiel: "Loray",
                    feature_ref: {
                        typename: "CADASTRALPARCELS.PARCELLAIRE_EXPRESS:commune",
                        feature_id: "commune.1",
                    },
                }),
                expect.objectContaining({
                    type: "parcelle",
                    idu: "25349000AD0023",
                    feature_ref: {
                        typename: "CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle",
                        feature_id: "parcelle.1",
                    },
                }),
            ]),
        });
        expect(payload).toMatchObject(response.structuredContent as Record<string, unknown>);
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
