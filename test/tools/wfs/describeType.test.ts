import { describe, it, expect } from "vitest";

import type { Collection } from "@ignfab/gpf-schema-store";

import GpfDescribeTypeTool from "../../../src/tools/GpfDescribeTypeTool";

describe("Test GpfDescribeTypeTool",() => {
    const mockCollection: Collection = {
        id: "BDTOPO_V3:batiment",
        namespace: "BDTOPO_V3",
        name: "batiment",
        title: "Batiment",
        description: "Description de test",
        properties: [
            {
                name: "hauteur",
                type: "float",
            },
        ],
    };

    class TestableGpfDescribeTypeTool extends GpfDescribeTypeTool {
        async execute() {
            return mockCollection;
        }
    }

    class TestableGpfDescribeTypeToolError extends GpfDescribeTypeTool {
        async execute(): Promise<never> {
            throw new Error("Le type 'BDTOPO_V3:not_found' est introuvable. Utiliser gpf_search_types pour trouver un type valide.");
        }
    }

    it("should expose an enriched MCP definition", () => {
        const tool = new GpfDescribeTypeTool();
        expect(tool.toolDefinition.title).toEqual("Description d’un type GPF");
        expect(tool.toolDefinition.inputSchema.properties?.typename).toMatchObject({
            type: "string",
            minLength: 1,
        });
        expect(tool.toolDefinition.outputSchema).toBeDefined();
    });

    it("should return both text content and structuredContent", async () => {
        const tool = new TestableGpfDescribeTypeTool();
        const response = await tool.toolCall({
            params: {
                name: "gpf_describe_type",
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
            id: "BDTOPO_V3:batiment",
        });
        expect(response.structuredContent).toBeDefined();
        expect(response.structuredContent).toMatchObject({
            id: "BDTOPO_V3:batiment",
        });
    });

    it("should return isError=true for invalid input", async () => {
        const tool = new GpfDescribeTypeTool();
        const response = await tool.toolCall({
            params: {
                name: "gpf_describe_type",
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
        expect(textContent.text).toContain("Paramètres invalides");
        expect(response.structuredContent).toMatchObject({
            type: "urn:geocontext:problem:invalid-tool-params",
            errors: expect.arrayContaining([
                expect.objectContaining({
                    name: "typename",
                    code: "too_small",
                    detail: "le nom du type ne doit pas être vide",
                }),
            ]),
        });
    });

    it("should return isError=true when execute fails", async () => {
        const tool = new TestableGpfDescribeTypeToolError();
        const response = await tool.toolCall({
            params: {
                name: "gpf_describe_type",
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
        expect(textContent.text).toContain("gpf_search_types");
        expect(response.structuredContent).toMatchObject({
            type: "urn:geocontext:problem:execution-error",
        });
    });
});
