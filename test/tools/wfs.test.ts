import GpfWfsDescribeTypeTool from "../../src/tools/GpfWfsDescribeTypeTool";
import GpfWfsGetFeaturesTool from "../../src/tools/GpfWfsGetFeaturesTool";
import GpfWfsListTypesTool from "../../src/tools/GpfWfsListTypesTool";
import GpfWfsSearchTypesTool from "../../src/tools/GpfWfsSearchTypesTool";
import type { Collection } from "@ignfab/gpf-schema-store";

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
        expect(textContent.text).toContain("la requête de recherche ne doit pas être vide");
    });
});

describe("Test GpfWfsListTypesTool",() => {
    class TestableGpfWfsListTypesTool extends GpfWfsListTypesTool {
        async execute() {
            return [
                {
                    id: "BDTOPO_V3:batiment",
                    title: "Batiment",
                    description: "Description de test",
                },
            ];
        }
    }

    it("should expose an enriched MCP definition", () => {
        const tool = new GpfWfsListTypesTool();
        expect(tool.toolDefinition.title).toEqual("Liste complète des types WFS");
        expect(tool.toolDefinition.inputSchema.properties).toEqual({});
        expect(tool.toolDefinition.outputSchema).toBeUndefined();
    });

    it("should return text content without structuredContent", async () => {
        const tool = new TestableGpfWfsListTypesTool();
        const response = await tool.toolCall({
            params: {
                name: "gpf_wfs_list_types",
                arguments: {},
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
        expect(results.length).toBeGreaterThan(0);
        expect(results).toEqual(expect.arrayContaining([
            expect.objectContaining({
                id: "BDTOPO_V3:batiment",
            }),
        ]));
        expect(response.structuredContent).toBeUndefined();
    });
});

describe("Test GpfWfsDescribeTypeTool",() => {
    const mockCollection: Collection = {
        id: "BDTOPO_V3:batiment",
        namespace: "BDTOPO_V3",
        name: "batiment",
        title: "Batiment",
        description: "Description de test",
        properties: [
            {
                name: "hauteur",
                type: "number",
            },
        ],
    };

    class TestableGpfWfsDescribeTypeTool extends GpfWfsDescribeTypeTool {
        async execute() {
            return {
                result: mockCollection,
            };
        }
    }

    class TestableGpfWfsDescribeTypeToolError extends GpfWfsDescribeTypeTool {
        async execute(): Promise<never> {
            throw new Error("Le type 'BDTOPO_V3:not_found' est introuvable. Utiliser gpf_wfs_search_types pour trouver un type valide.");
        }
    }

    it("should expose an enriched MCP definition", () => {
        const tool = new GpfWfsDescribeTypeTool();
        expect(tool.toolDefinition.title).toEqual("Description d’un type WFS");
        expect(tool.toolDefinition.inputSchema.properties?.typename).toMatchObject({
            type: "string",
            minLength: 1,
        });
        expect(tool.toolDefinition.outputSchema).toBeDefined();
    });

    it("should return both text content and structuredContent", async () => {
        const tool = new TestableGpfWfsDescribeTypeTool();
        const response = await tool.toolCall({
            params: {
                name: "gpf_wfs_describe_type",
                arguments: {
                    typename: "BDTOPO_V3:batiment",
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
            result: {
                id: "BDTOPO_V3:batiment",
            },
        });
        expect(response.structuredContent).toBeDefined();
        expect(response.structuredContent).toMatchObject({
            result: {
                id: "BDTOPO_V3:batiment",
            },
        });
    });

    it("should return isError=true for invalid input", async () => {
        const tool = new GpfWfsDescribeTypeTool();
        const response = await tool.toolCall({
            params: {
                name: "gpf_wfs_describe_type",
                arguments: {
                    typename: "",
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
        expect(textContent.text).toContain("le nom du type ne doit pas être vide");
    });

    it("should return isError=true when execute fails", async () => {
        const tool = new TestableGpfWfsDescribeTypeToolError();
        const response = await tool.toolCall({
            params: {
                name: "gpf_wfs_describe_type",
                arguments: {
                    typename: "BDTOPO_V3:not_found",
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
        expect(textContent.text).toContain("Le type 'BDTOPO_V3:not_found' est introuvable");
        expect(textContent.text).toContain("gpf_wfs_search_types");
    });
});

describe("Test GpfWfsGetFeaturesTool",() => {
    class TestableGpfWfsGetFeaturesTool extends GpfWfsGetFeaturesTool {
        respond(data: unknown) {
            return this.createSuccessResponse(data);
        }
    }

    const featureCollection: {
        type: string;
        features: Array<{
            type: string;
            id: string;
            geometry: null;
            properties: {
                code_insee: string;
            };
        }>;
        totalFeatures: number;
    } = {
        type: "FeatureCollection",
        features: [
            {
                type: "Feature",
                id: "commune.1",
                geometry: null,
                properties: {
                    code_insee: "01001",
                },
            },
        ],
        totalFeatures: 34877,
    };

    it("should expose an enriched MCP definition", () => {
        const tool = new GpfWfsGetFeaturesTool();
        expect(tool.toolDefinition.title).toEqual("Lecture d’objets WFS");
        expect(tool.toolDefinition.inputSchema.properties?.typename).toMatchObject({
            type: "string",
            minLength: 1,
        });
        expect(tool.toolDefinition.inputSchema.properties?.count).toMatchObject({
            type: "integer",
            minimum: 1,
            maximum: 1000,
        });
        expect(tool.toolDefinition.outputSchema).toBeUndefined();
    });

    it("should return a FeatureCollection without structuredContent for results", () => {
        const tool = new TestableGpfWfsGetFeaturesTool();
        const response = tool.respond(featureCollection);

        expect("isError" in response).toBe(false);
        expect(response.structuredContent).toBeUndefined();
        expect(response.content[0]).toMatchObject({
            type: "text",
        });
        const textContent = response.content[0];
        if (textContent.type !== "text") {
            throw new Error("expected text content");
        }
        expect(JSON.parse(textContent.text)).toMatchObject({
            type: "FeatureCollection",
            features: expect.any(Array),
        });
    });

    it("should return text content and structuredContent for hits", () => {
        const tool = new TestableGpfWfsGetFeaturesTool();
        const response = tool.respond({
            result_type: "hits",
            totalFeatures: featureCollection.totalFeatures,
        });

        expect("isError" in response).toBe(false);
        expect(response.content[0]).toMatchObject({
            type: "text",
        });
        const textContent = response.content[0];
        if (textContent.type !== "text") {
            throw new Error("expected text content");
        }
        expect(Number(JSON.parse(textContent.text))).toBeGreaterThan(0);
        expect(response.structuredContent).toMatchObject({
            result_type: "hits",
            totalFeatures: expect.any(Number),
        });
    });

    it("should return text content and structuredContent for url", async () => {
        const tool = new GpfWfsGetFeaturesTool();
        const response = await tool.toolCall({
            params: {
                name: "gpf_wfs_get_features",
                arguments: {
                    typename: "ADMINEXPRESS-COG.LATEST:commune",
                    result_type: "url",
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
        expect(textContent.text).toContain("service=WFS");
        expect(response.structuredContent).toMatchObject({
            result_type: "url",
            url: expect.stringContaining("service=WFS"),
        });
    });

    it("should return isError=true for invalid input", async () => {
        const tool = new GpfWfsGetFeaturesTool();
        const response = await tool.toolCall({
            params: {
                name: "gpf_wfs_get_features",
                arguments: {
                    typename: "",
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
        expect(textContent.text).toContain("le nom du type ne doit pas être vide");
    });
});
