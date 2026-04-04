import GeocodeTool from "../../src/tools/GeocodeTool";

describe("Test GeocodeTool",() => {
    class TestableGeocodeTool extends GeocodeTool {
        async execute() {
            return {
                results: [
                    {
                        lon: 2.41935,
                        lat: 48.841291,
                        fulltext: "Saint-Mandé, 94160",
                        kind: "commune",
                        city: "Saint-Mandé",
                        zipcode: "94160",
                    },
                ],
            };
        }
    }

    it("should expose an enriched MCP definition", () => {
        const tool = new GeocodeTool();
        expect(tool.toolDefinition.title).toEqual("Géocodage de lieux et d’adresses");
        expect(tool.toolDefinition.inputSchema.properties?.text).toMatchObject({
            type: "string",
            minLength: 1,
        });
        expect(tool.toolDefinition.inputSchema.properties?.maximumResponses).toMatchObject({
            type: "integer",
            minimum: 1,
            maximum: 10,
        });
        expect(tool.toolDefinition.outputSchema).toBeDefined();
    });

    it("should return both text content and structuredContent", async () => {
        const tool = new TestableGeocodeTool();
        const response = await tool.toolCall({
            params: {
                name: "geocode",
                arguments: {
                    text: "Saint-Mande",
                    maximumResponses: 1,
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
        expect(JSON.parse(textContent.text)).toMatchObject({
            results: [
                expect.objectContaining({
                    fulltext: "Saint-Mandé, 94160",
                }),
            ],
        });
        expect(response.structuredContent).toBeDefined();
        expect(response.structuredContent).toMatchObject({
            results: [
                {
                    fulltext: "Saint-Mandé, 94160",
                },
            ],
        });
    });

    it("should return isError=true for invalid input", async () => {
        const tool = new GeocodeTool();
        const response = await tool.toolCall({
            params: {
                name: "geocode",
                arguments: {
                    text: "",
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
        expect(textContent.text).toContain("le texte ne doit pas être vide");
    });
});
