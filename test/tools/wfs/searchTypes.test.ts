import GpfWfsSearchTypesTool from "../../../src/tools/GpfWfsSearchTypesTool";

describe("Test GpfWfsSearchTypesTool",() => {
    class TestableGpfWfsSearchTypesTool extends GpfWfsSearchTypesTool {
        async execute() {
            return {
                results: [
                    {
                        id: "BDTOPO_V3:batiment",
                        title: "Batiment",
                        description: "Description de test",
                    },
                ],
            };
        }
    }

    it("should expose an enriched MCP definition", () => {
        const tool = new GpfWfsSearchTypesTool();
        expect(tool.toolDefinition.title).toEqual("Recherche de types WFS");
        expect(tool.toolDefinition.inputSchema.properties?.query).toMatchObject({
            type: "string",
            minLength: 1,
        });
        expect(tool.toolDefinition.inputSchema.properties?.max_results).toMatchObject({
            type: "integer",
            minimum: 1,
            maximum: 50,
        });
        expect(tool.toolDefinition.outputSchema).toBeDefined();
    });

    it("should return both text content and structuredContent", async () => {
        const tool = new TestableGpfWfsSearchTypesTool();
        const response = await tool.toolCall({
            params: {
                name: "gpf_wfs_search_types",
                arguments: {
                    query: "batiment",
                    max_results: 1,
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
                {
                    id: "BDTOPO_V3:batiment",
                },
            ],
        });
        expect(response.structuredContent).toBeDefined();
        expect(response.structuredContent).toMatchObject({
            results: [
                {
                    id: "BDTOPO_V3:batiment",
                },
            ],
        });
    });

    it("should return isError=true for invalid input", async () => {
        const tool = new GpfWfsSearchTypesTool();
        const response = await tool.toolCall({
            params: {
                name: "gpf_wfs_search_types",
                arguments: {
                    query: "",
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
                    name: "query",
                    code: "too_small",
                    detail: "la requête de recherche ne doit pas être vide",
                }),
            ]),
        });
    });
});
