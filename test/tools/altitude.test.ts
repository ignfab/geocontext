import { describe, it, expect } from "vitest";

import AltitudeTool from "../../src/tools/AltitudeTool";
import { expectInvalidLon } from "./helpers/errorAssertions";
import { paris } from "../samples";
import { toolCall, toolDefinition } from "./helpers/mcp";

describe("Test AltitudeTool",() => {
    class TestableAltitudeTool extends AltitudeTool {
        async execute() {
            return {
                lon: paris.coordinates[0],
                lat: paris.coordinates[1],
                altitude: 34.78,
                accuracy: "Variable suivant la source de mesure",
            };
        }
    }

    it("should expose an enriched MCP definition", () => {
        const tool = new AltitudeTool();
        expect(toolDefinition(tool).title).toEqual("Altitude d'une position");
        expect(toolDefinition(tool).inputSchema.properties?.lon).toMatchObject({
            type: "number",
            minimum: -180,
            maximum: 180,
        });
        expect(toolDefinition(tool).inputSchema.properties?.lat).toMatchObject({
            type: "number",
            minimum: -90,
            maximum: 90,
        });
        expect(toolDefinition(tool).outputSchema).toBeDefined();
    });

    it("should return both text content and structuredContent", async () => {
        const c = paris.coordinates;
        const tool = new TestableAltitudeTool();
        const response = await toolCall(tool, {
            params: {
                name: "altitude",
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
        expect(JSON.parse(textContent.text)).toMatchObject({
            lon: c[0],
            lat: c[1],
        });
        expect(response.structuredContent).toBeDefined();
        expect(response.structuredContent).toMatchObject({
            lon: c[0],
            lat: c[1],
        });
    });

    it("should reject out-of-range coordinates at the tool boundary", async () => {
        const tool = new AltitudeTool();
        const response = await toolCall(tool, {
            params: {
                name: "altitude",
                arguments: {
                    lon: 600,
                    lat: 600,
                },
            },
        });

        expectInvalidLon(response);
    });
});
